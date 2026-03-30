const Group = require('../models/groupSchema');
const User = require('../models/userSchema');
const Expense = require('../models/expenseSchema');
/**
 * @desc    Create a new group
 * @route   POST /api/groups
 * @access  Private
 */
exports.createGroup = async (req, res) => {
    try {
        const { name, type } = req.body;
        const userId = req.user._id;

        // Validate group name
        if (!name || !name.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: "Group name is required" 
            });
        }

        // Validate group type
        const validTypes = ['TRIP', 'HOME', 'COUPLE', 'OTHER'];
        const groupType = validTypes.includes(type) ? type : 'OTHER';

        // Create the group with creator and add creator as first member
        const newGroup = await Group.create({
            name: name.trim(),
            type: groupType,
            createdBy: userId,
            members: [userId]
        });

        // Add group to user's groups array
        await User.findByIdAndUpdate(
            userId,
            { $push: { groups: newGroup._id } }
        );

        // Populate the group with member details before sending response
        const populatedGroup = await Group.findById(newGroup._id)
            .populate('members', 'name email avatar')
            .populate('createdBy', 'name email');

        res.status(201).json({ 
            success: true, 
            group: populatedGroup,
            message: "Group created successfully"
        });

    } catch (error) {
        console.error("Error creating group:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error. Please try again later." 
        });
    }
};


exports.joinGroup = async (req, res) => {
    try {
        const { shareCode } = req.body;
        const userId = req.user._id;
        if(!shareCode || !shareCode.trim()){
            return res.status(400).json({
                success:false,
                message:"Share code is required"
            });
        }
        const group=await Group.findOne({shareCode:shareCode.trim().toUpperCase()});
        if(!group){
            return res.status(404).json({
                success:false,
                message:"Invalid share code. Group not found"
            });
        }
        const isAlreadyMember=group.members.some(
            member=>member.toString()===userId.toString()
        );
        if(isAlreadyMember){
            return res.status(400).json({
                success:false,
                message:"You are already a member of this group"
            });
        }
        group.members.push(userId);
        await group.save();
        await User.findByIdAndUpdate(userId,{
            $push:{groups:group._id}
        });

        res.status(200).json({
            success:true,
            message:"Joined group successfully",
            groupId:group._id
        });
    } catch (error) {
        console.error("Error joining group:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error. Please try again later." 
        });
    }
    
};

/**
 * @desc    Get all groups for the logged-in user
 * @route   GET /api/groups
 * @access  Private
 */
exports.getGroups = async (req, res) => {
    try {
        const userId = req.user._id;
        const currentUserId = userId.toString();

        // Find all groups where user is a member
        const groups = await Group.find({ members: userId })
            .populate('members', 'name email avatar')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

        const groupsWithBalance = groups.map((group) => {
            let myBalance = 0;
            (group.simplifyDebts || []).forEach((debt) => {
                const fromId = debt.from?.toString?.() || '';
                const toId = debt.to?.toString?.() || '';
                const amount = Number(debt.amount || 0);
                if (!amount) return;
                if (fromId === currentUserId) myBalance -= amount;
                if (toId === currentUserId) myBalance += amount;
            });

            return {
                ...group.toObject(),
                myBalance: Math.round(myBalance * 100) / 100
            };
        });

        res.status(200).json({ 
            success: true, 
            groups: groupsWithBalance,
            count: groupsWithBalance.length
        });

    } catch (error) {
        console.error("Error fetching groups:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error. Please try again later." 
        });
    }
};

/**
 * @desc    Get a specific group by ID
 * @route   GET /api/groups/:id
 * @access  Private
 */
exports.getGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const UserId=req.user._id.toString();
        const group=await Group.findById(id)
        .populate('members', 'name email avatar upi_id')
        .populate('createdBy', 'name email');
        if(!group){
            return res.status(404).json({
                success:false,
                message:"Group not found"
            });
        }
        const isMember=group.members.some(
            member=>member._id.toString()===UserId
        );
        if(!isMember){
            return res.status(403).json({
                success:false,
                message:"You are not a member of this group"
            });
        }
         let balance=0;
         if(group.simplifyDebts && group.simplifyDebts.length>0){
            group.simplifyDebts.forEach(debt =>{
                if (debt.from.toString()===UserId){
                    balance -=debt.amount;

                }
                if(debt.to.toString()===UserId){
                    balance +=debt.amount;
                }
            });
         }
         const expenses = await Expense.find({ group: id })
            .populate('paidBy', 'name avatar') // Who paid?
            .populate('shares.user', 'name')   // <--- NEW: Need names for the split details
            .sort({ date: -1 });
        res.status(200).json({
            success:true,
            group:{
                ...group.toObject(),
                myBalance:balance
            },
            expenses:expenses
        });
         

    } catch (error) {
        console.error("Error fetching group:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * @desc    Get all members for a group with quick stats
 * @route   GET /api/groups/:id/members
 * @access  Private (Group members only)
 */
exports.getGroupMembers = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUserId = req.user._id.toString();

        const group = await Group.findById(id)
            .populate('members', 'name email avatar')
            .populate('createdBy', 'name email');

        if (!group) {
            return res.status(404).json({ success: false, message: "Group not found" });
        }

        const isMember = group.members.some((member) => member._id.toString() === currentUserId);
        if (!isMember) {
            return res.status(403).json({ success: false, message: "You are not a member of this group" });
        }

        const memberIds = group.members.map((member) => member._id);
        const paidCounts = await Expense.aggregate([
            { $match: { group: group._id, paidBy: { $in: memberIds } } },
            { $group: { _id: '$paidBy', count: { $sum: 1 }, totalPaid: { $sum: '$amount' } } }
        ]);

        const paidMap = new Map(paidCounts.map((row) => [row._id.toString(), row]));

        const members = group.members.map((member) => {
            const paidStat = paidMap.get(member._id.toString());
            let netInGroup = 0;
            (group.simplifyDebts || []).forEach((debt) => {
                const from = debt.from?.toString?.() || debt.from?._id?.toString?.();
                const to = debt.to?.toString?.() || debt.to?._id?.toString?.();
                const amount = Number(debt.amount || 0);
                if (!amount) return;
                if (from === member._id.toString()) netInGroup -= amount;
                if (to === member._id.toString()) netInGroup += amount;
            });

            return {
                id: member._id,
                name: member.name,
                email: member.email,
                avatar: member.avatar,
                expensesPaidCount: paidStat?.count || 0,
                totalPaid: Math.round(Number(paidStat?.totalPaid || 0) * 100) / 100,
                netInGroup: Math.round(netInGroup * 100) / 100
            };
        });

        res.status(200).json({
            success: true,
            group: { id: group._id, name: group.name, type: group.type },
            members
        });
    } catch (error) {
        console.error("Error fetching group members:", error);
        res.status(500).json({ success: false, message: "Server error while fetching group members" });
    }
};

/**
 * @desc    Get a member's transactions in a group
 * @route   GET /api/groups/:id/members/:memberId/transactions
 * @access  Private (Group members only)
 */
exports.getMemberTransactions = async (req, res) => {
    try {
        const { id, memberId } = req.params;
        const currentUserId = req.user._id.toString();

        const group = await Group.findById(id).populate('members', 'name email avatar');
        if (!group) {
            return res.status(404).json({ success: false, message: "Group not found" });
        }

        const isRequesterMember = group.members.some((member) => member._id.toString() === currentUserId);
        if (!isRequesterMember) {
            return res.status(403).json({ success: false, message: "You are not a member of this group" });
        }

        const targetMember = group.members.find((member) => member._id.toString() === memberId);
        if (!targetMember) {
            return res.status(404).json({ success: false, message: "Member not found in this group" });
        }

        const expenses = await Expense.find({
            group: id,
            $or: [{ paidBy: memberId }, { 'shares.user': memberId }]
        })
            .populate('paidBy', 'name avatar')
            .populate('shares.user', 'name avatar')
            .sort({ date: -1 });

        const transactions = expenses.map((expense) => {
            const paidByMember = expense.paidBy?._id?.toString() === memberId;
            const share = expense.shares.find((s) => s.user?._id?.toString() === memberId);
            return {
                id: expense._id,
                description: expense.description,
                amount: expense.amount,
                date: expense.date,
                isSettlement: expense.isSettlement,
                paidBy: expense.paidBy,
                memberShare: Number(share?.owedAmount || 0),
                paidByMember,
                split: expense.shares.map((s) => ({
                    user: s.user,
                    owedAmount: s.owedAmount,
                    paidAmount: s.paidAmount
                }))
            };
        });

        const summary = transactions.reduce((acc, item) => {
            if (item.paidByMember) acc.totalPaid += Number(item.amount || 0);
            acc.totalShare += Number(item.memberShare || 0);
            return acc;
        }, { totalPaid: 0, totalShare: 0 });

        summary.totalPaid = Math.round(summary.totalPaid * 100) / 100;
        summary.totalShare = Math.round(summary.totalShare * 100) / 100;
        summary.net = Math.round((summary.totalPaid - summary.totalShare) * 100) / 100;

        res.status(200).json({
            success: true,
            group: { id: group._id, name: group.name },
            member: { id: targetMember._id, name: targetMember.name, email: targetMember.email, avatar: targetMember.avatar },
            summary,
            transactions
        });
    } catch (error) {
        console.error("Error fetching member transactions:", error);
        res.status(500).json({ success: false, message: "Server error while fetching member transactions" });
    }
};


/**
 * @desc    Update group details (name, type)
 * @route   PUT /api/groups/:id
 * @access  Private (Only creator)
 */
exports.updateGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type } = req.body;
        const userId = req.user._id;

        // Find the group
        const group = await Group.findById(id);

        if (!group) {
            return res.status(404).json({ 
                success: false, 
                message: "Group not found" 
            });
        }

        // Check if user is the creator (only creator can update)
        if (group.createdBy.toString() !== userId.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: "Only the group creator can update group details" 
            });
        }

        // Update group name if provided
        if (name && name.trim()) {
            group.name = name.trim();
        }

        // Update group type if provided and valid
        if (type) {
            const validTypes = ['TRIP', 'HOME', 'COUPLE', 'OTHER'];
            if (validTypes.includes(type)) {
                group.type = type;
            }
        }

        // Save the updated group
        await group.save();

        // Fetch the updated group with populated fields
        const updatedGroup = await Group.findById(id)
            .populate('members', 'name email avatar')
            .populate('createdBy', 'name email');

        res.status(200).json({ 
            success: true, 
            group: updatedGroup,
            message: "Group updated successfully" 
        });

    } catch (error) {
        console.error("Error updating group:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error. Please try again later." 
        });
    }
};

/**
 * @desc    Delete a group
 * @route   DELETE /api/groups/:id
 * @access  Private (Only creator)
 */
exports.deleteGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        // Find the group
        const group = await Group.findById(id);

        if (!group) {
            return res.status(404).json({ 
                success: false, 
                message: "Group not found" 
            });
        }

        // Check if user is the creator (only creator can delete)
        if (group.createdBy.toString() !== userId.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: "Only the group creator can delete the group" 
            });
        }

        // Remove group from all members' groups array
        await User.updateMany(
            { groups: id },
            { $pull: { groups: id } }
        );

        // Delete the group
        await Group.findByIdAndDelete(id);

        res.status(200).json({ 
            success: true, 
            message: "Group deleted successfully" 
        });

    } catch (error) {
        console.error("Error deleting group:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error. Please try again later." 
        });
    }
};

/**
 * @desc    Add member to a group
 * @route   POST /api/groups/:id/members
 * @access  Private (Any group member)
 */
exports.addMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId: newMemberId } = req.body;
        const currentUserId = req.user._id;

        if (!newMemberId) {
            return res.status(400).json({ 
                success: false, 
                message: "User ID is required" 
            });
        }

        // Find the group
        const group = await Group.findById(id);

        if (!group) {
            return res.status(404).json({ 
                success: false, 
                message: "Group not found" 
            });
        }

        // Check if current user is a member
        const isCurrentUserMember = group.members.some(
            member => member.toString() === currentUserId.toString()
        );

        if (!isCurrentUserMember) {
            return res.status(403).json({ 
                success: false, 
                message: "You must be a member to add others" 
            });
        }

        // Check if new member already exists
        const isMemberAlready = group.members.some(
            member => member.toString() === newMemberId
        );

        if (isMemberAlready) {
            return res.status(400).json({ 
                success: false, 
                message: "User is already a member" 
            });
        }

        // Check if the user to add exists
        const newUser = await User.findById(newMemberId);
        if (!newUser) {
            return res.status(404).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        // Add member to group
        group.members.push(newMemberId);
        await group.save();

        // Add group to user's groups array
        await User.findByIdAndUpdate(
            newMemberId,
            { $push: { groups: id } }
        );

        // Return updated group
        const updatedGroup = await Group.findById(id)
            .populate('members', 'name email avatar')
            .populate('createdBy', 'name email');

        res.status(200).json({ 
            success: true, 
            group: updatedGroup,
            message: "Member added successfully" 
        });

    } catch (error) {
        console.error("Error adding member:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error. Please try again later." 
        });
    }
};

/**
 * @desc    Remove member from a group
 * @route   DELETE /api/groups/:id/members/:userId
 * @access  Private (Creator or the member themselves)
 */
exports.removeMember = async (req, res) => {
    try {
        const { id, userId: memberToRemove } = req.params;
        const currentUserId = req.user._id;

        // Find the group
        const group = await Group.findById(id);

        if (!group) {
            return res.status(404).json({ 
                success: false, 
                message: "Group not found" 
            });
        }

        // Check if user is creator or removing themselves
        const isCreator = group.createdBy.toString() === currentUserId.toString();
        const isRemovingSelf = memberToRemove === currentUserId.toString();

        if (!isCreator && !isRemovingSelf) {
            return res.status(403).json({ 
                success: false, 
                message: "Only creator can remove members or you can remove yourself" 
            });
        }

        // Cannot remove creator
        if (memberToRemove === group.createdBy.toString()) {
            return res.status(400).json({ 
                success: false, 
                message: "Cannot remove group creator" 
            });
        }

        // Remove member from group
        group.members = group.members.filter(
            member => member.toString() !== memberToRemove
        );
        await group.save();

        // Remove group from user's groups array
        await User.findByIdAndUpdate(
            memberToRemove,
            { $pull: { groups: id } }
        );

        // Return updated group
        const updatedGroup = await Group.findById(id)
            .populate('members', 'name email avatar')
            .populate('createdBy', 'name email');

        res.status(200).json({ 
            success: true, 
            group: updatedGroup,
            message: "Member removed successfully" 
        });

    } catch (error) {
        console.error("Error removing member:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error. Please try again later." 
        });
    }
};
