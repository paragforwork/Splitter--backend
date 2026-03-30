const User = require('../models/userSchema');
const Group = require('../models/groupSchema');
const Expense = require('../models/expenseSchema');

const formatDateLabel = (dateValue) => {
  const date = new Date(dateValue);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short'
  });
};

const amountFormatter = new Intl.NumberFormat('en-IN');

const getActivityLine = (item, currentUserId) => {
  const paidByYou = item.paidBy?._id?.toString() === currentUserId;
  if (item.isSettlement) {
    const receiver = item.shares?.[0]?.user;
    const receiverId = receiver?._id?.toString();
    const receiverName = receiverId === currentUserId ? 'you' : receiver?.name || 'someone';

    if (paidByYou) {
      return `You settled with ${receiverName}`;
    }
    return `${item.paidBy?.name || 'Someone'} settled with you`;
  }

  if (paidByYou) {
    return `You paid ₹${amountFormatter.format(item.amount)} for ${item.description}`;
  }
  return `${item.paidBy?.name || 'Someone'} paid ₹${amountFormatter.format(item.amount)} for ${item.description}`;
};

const buildPerPersonBalances = (groups, userId) => {
  const map = new Map();

  groups.forEach((group) => {
    (group.simplifyDebts || []).forEach((debt) => {
      const from = debt.from?._id?.toString() || debt.from?.toString();
      const to = debt.to?._id?.toString() || debt.to?.toString();
      const amount = Number(debt.amount || 0);
      if (!amount) return;

      if (from === userId && to) {
        const existing = map.get(to) || { user: debt.to, amount: 0 };
        existing.amount -= amount;
        map.set(to, existing);
      }

      if (to === userId && from) {
        const existing = map.get(from) || { user: debt.from, amount: 0 };
        existing.amount += amount;
        map.set(from, existing);
      }
    });
  });

  const youOwe = [];
  const youAreOwed = [];

  map.forEach((entry, key) => {
    const name = entry.user?.name || 'Unknown';
    const avatar = entry.user?.avatar || null;
    const upiId = entry.user?.upi_id || null;
    const item = {
      userId: key,
      name,
      avatar,
      upiId,
      amount: Math.round(Math.abs(entry.amount) * 100) / 100
    };

    if (entry.amount < 0) youOwe.push(item);
    if (entry.amount > 0) youAreOwed.push(item);
  });

  youOwe.sort((a, b) => b.amount - a.amount);
  youAreOwed.sort((a, b) => b.amount - a.amount);

  return { youOwe, youAreOwed };
};

exports.getOverview = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const user = await User.findById(userId).select('name email phone avatar upi_id upiVerified fcmToken notificationEnabled');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const groups = await Group.find({ members: userId })
      .select('name avatar type members simplifyDebts')
      .populate('members', 'name avatar')
      .populate('simplifyDebts.from', 'name avatar upi_id')
      .populate('simplifyDebts.to', 'name avatar upi_id')
      .sort({ createdAt: -1 });

    let youOweTotal = 0;
    let youAreOwedTotal = 0;
    const groupBalances = [];

    groups.forEach((group) => {
      let balance = 0;
      (group.simplifyDebts || []).forEach((debt) => {
        const from = debt.from?._id?.toString() || debt.from?.toString();
        const to = debt.to?._id?.toString() || debt.to?.toString();
        const amount = Number(debt.amount || 0);
        if (!amount) return;

        if (from === userId) {
          youOweTotal += amount;
          balance -= amount;
        } else if (to === userId) {
          youAreOwedTotal += amount;
          balance += amount;
        }
      });

      groupBalances.push({
        groupId: group._id,
        name: group.name,
        avatar: group.avatar,
        type: group.type,
        memberCount: group.members.length,
        balance: Math.round(balance * 100) / 100
      });
    });

    const netBalance = Math.round((youAreOwedTotal - youOweTotal) * 100) / 100;
    const perPerson = buildPerPersonBalances(groups, userId);

    const recentExpenses = await Expense.find({
      $or: [{ paidBy: userId }, { 'shares.user': userId }]
    })
      .populate('paidBy', 'name')
      .populate('shares.user', 'name')
      .populate('group', 'name')
      .sort({ date: -1 })
      .limit(15);

    const recentActivity = recentExpenses.map((item) => ({
      id: item._id,
      type: item.isSettlement ? 'settlement' : 'expense',
      title: getActivityLine(item, userId),
      groupName: item.group?.name || 'Unknown group',
      amount: item.amount,
      date: item.date,
      dateLabel: formatDateLabel(item.date),
      byYou: item.paidBy?._id?.toString() === userId,
      involveYouAsDebtor: item.shares?.some((share) => share.user?._id?.toString() === userId)
    }));

    const notifications = recentActivity.slice(0, 8).map((activity) => ({
      id: activity.id,
      title: activity.title,
      subtitle: `${activity.groupName} · ${activity.dateLabel}`,
      date: activity.date
    }));

    res.status(200).json({
      success: true,
      account: {
        profile: {
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          avatar: user.avatar,
          upiId: user.upi_id || '',
          upiVerified: Boolean(user.upiVerified),
          hasFcmToken: Boolean(user.fcmToken),
          notificationEnabled: user.notificationEnabled !== false
        },
        summary: {
          youOwe: Math.round(youOweTotal * 100) / 100,
          youAreOwed: Math.round(youAreOwedTotal * 100) / 100,
          netBalance
        },
        peopleBalances: perPerson,
        groupBalances,
        recentActivity,
        notifications
      }
    });
  } catch (error) {
    console.error('Error in getOverview:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching account overview' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, phone, avatar } = req.body;

    const updates = {};
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (typeof phone === 'string') updates.phone = phone.trim();
    if (typeof avatar === 'string' && avatar.trim()) updates.avatar = avatar.trim();

    const user = await User.findByIdAndUpdate(userId, updates, { new: true }).select('name email phone avatar upi_id upiVerified notificationEnabled');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated',
      profile: {
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        avatar: user.avatar,
        upiId: user.upi_id || '',
        upiVerified: Boolean(user.upiVerified),
        notificationEnabled: user.notificationEnabled !== false
      }
    });
  } catch (error) {
    console.error('Error in updateProfile:', error);
    res.status(500).json({ success: false, message: 'Server error while updating profile' });
  }
};

exports.updateUpi = async (req, res) => {
  try {
    const userId = req.user._id;
    const { upiId } = req.body;
    if (typeof upiId !== 'string' || !upiId.trim()) {
      return res.status(400).json({ success: false, message: 'UPI ID is required' });
    }

    const clean = upiId.trim().toLowerCase();
    const upiPattern = /^[a-z0-9.\-_]{2,}@[a-z]{2,}$/i;
    if (!upiPattern.test(clean)) {
      return res.status(400).json({ success: false, message: 'Invalid UPI ID format' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { upi_id: clean, upiVerified: true },
      { new: true }
    ).select('upi_id upiVerified');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      message: 'UPI updated',
      upiId: user.upi_id || '',
      upiVerified: Boolean(user.upiVerified)
    });
  } catch (error) {
    console.error('Error in updateUpi:', error);
    res.status(500).json({ success: false, message: 'Server error while updating UPI' });
  }
};

exports.updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const { enabled, fcmToken } = req.body;
    const updates = {};

    if (typeof enabled === 'boolean') {
      updates.notificationEnabled = enabled;
    }

    if (typeof fcmToken === 'string') {
      updates.fcmToken = fcmToken.trim() || null;
    }

    const user = await User.findByIdAndUpdate(userId, updates, { new: true }).select('notificationEnabled fcmToken');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Notification settings updated',
      notificationEnabled: user.notificationEnabled !== false,
      hasFcmToken: Boolean(user.fcmToken)
    });
  } catch (error) {
    console.error('Error in updateNotificationSettings:', error);
    res.status(500).json({ success: false, message: 'Server error while updating notification settings' });
  }
};
