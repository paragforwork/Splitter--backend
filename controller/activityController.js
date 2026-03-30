const Expense = require('../models/expenseSchema');
const Group = require('../models/groupSchema');

const toDayLabel = (dateValue) => {
  const date = new Date(dateValue);
  const now = new Date();
  const midnightNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const midnightDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((midnightNow - midnightDate) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const buildActivityItem = (expense, currentUserId) => {
  const paidById = expense.paidBy?._id?.toString();
  const isPaidByYou = paidById === currentUserId;
  const myShare = expense.shares.find((share) => share.user?._id?.toString() === currentUserId);

  let status = 'neutral';
  let amount = 0;
  let counterparty = null;
  let message = '';
  let type = expense.isSettlement ? 'settlement' : 'expense';

  if (expense.isSettlement) {
    const receiver = expense.shares[0]?.user;
    const receiverId = receiver?._id?.toString();
    const receiverName = receiver?.name || 'Someone';

    amount = Number(expense.amount || 0);
    if (isPaidByYou) {
      status = 'settled_out';
      counterparty = receiver;
      message = `You paid ${receiverName} ₹${amount.toLocaleString('en-IN')}`;
    } else if (receiverId === currentUserId) {
      status = 'settled_in';
      counterparty = expense.paidBy;
      message = `${expense.paidBy?.name || 'Someone'} paid you ₹${amount.toLocaleString('en-IN')}`;
    } else {
      message = `${expense.paidBy?.name || 'Someone'} settled ₹${amount.toLocaleString('en-IN')}`;
    }
  } else {
    if (isPaidByYou) {
      const othersOwe = expense.shares
        .filter((share) => share.user?._id?.toString() !== currentUserId)
        .reduce((sum, share) => sum + Number(share.owedAmount || 0), 0);
      amount = Math.round(othersOwe * 100) / 100;
      status = amount > 0 ? 'get' : 'neutral';
      message = `You added "${expense.description}"`;
    } else {
      amount = Number(myShare?.owedAmount || 0);
      status = amount > 0 ? 'owe' : 'neutral';
      counterparty = expense.paidBy;
      message = `${expense.paidBy?.name || 'Someone'} added "${expense.description}"`;
    }
  }

  const splitDetails = expense.shares.map((share) => ({
    userId: share.user?._id,
    name: share.user?.name || 'Unknown',
    avatar: share.user?.avatar || null,
    owedAmount: Number(share.owedAmount || 0),
    paidAmount: Number(share.paidAmount || 0)
  }));

  return {
    id: expense._id,
    type,
    status,
    message,
    description: expense.description,
    amount: Math.round(amount * 100) / 100,
    group: {
      id: expense.group?._id,
      name: expense.group?.name || 'Unknown group'
    },
    actor: {
      id: expense.paidBy?._id,
      name: expense.paidBy?.name || 'Someone',
      avatar: expense.paidBy?.avatar || null
    },
    counterparty: counterparty
      ? {
          id: counterparty._id,
          name: counterparty.name || 'Someone',
          avatar: counterparty.avatar || null,
          upiId: counterparty.upi_id || null
        }
      : null,
    myShare: Number(myShare?.owedAmount || 0),
    receiptUrl: expense.receiptUrl || null,
    date: expense.date,
    dayLabel: toDayLabel(expense.date),
    splitDetails
  };
};

exports.getActivity = async (req, res) => {
  try {
    const currentUserId = req.user._id.toString();
    const { type = 'all', groupId = '', personId = '', page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 25));

    const groups = await Group.find({ members: currentUserId }).select('_id name');
    const accessibleGroupIds = new Set(groups.map((g) => g._id.toString()));

    const baseQuery = {
      group: { $in: [...accessibleGroupIds] },
      $or: [{ paidBy: currentUserId }, { 'shares.user': currentUserId }]
    };

    const expenses = await Expense.find(baseQuery)
      .populate('paidBy', 'name avatar upi_id')
      .populate('shares.user', 'name avatar upi_id')
      .populate('group', 'name')
      .sort({ date: -1 });

    let activities = expenses.map((expense) => buildActivityItem(expense, currentUserId));

    if (type !== 'all') {
      if (type === 'group') {
        activities = activities.filter((item) => item.type === 'group');
      } else {
        activities = activities.filter((item) => item.type === type);
      }
    }

    if (groupId) {
      activities = activities.filter((item) => item.group.id?.toString() === groupId);
    }

    if (personId) {
      activities = activities.filter((item) => {
        const actorMatch = item.actor.id?.toString() === personId;
        const counterMatch = item.counterparty?.id?.toString() === personId;
        return actorMatch || counterMatch;
      });
    }

    const grouped = activities.reduce((acc, item) => {
      if (!acc[item.dayLabel]) acc[item.dayLabel] = [];
      acc[item.dayLabel].push(item);
      return acc;
    }, {});

    const pendingActions = activities
      .filter((item) => item.status === 'owe' || item.status === 'get')
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        text:
          item.status === 'owe'
            ? `You owe ${item.counterparty?.name || 'friend'} ₹${item.amount.toLocaleString('en-IN')}`
            : `${item.counterparty?.name || 'Friend'} owes you ₹${item.amount.toLocaleString('en-IN')}`,
        status: item.status,
        amount: item.amount,
        person: item.counterparty || item.actor,
        group: item.group
      }));

    const peopleMap = new Map();
    activities.forEach((item) => {
      const people = [item.actor, item.counterparty].filter(Boolean);
      people.forEach((person) => {
        const id = person.id?.toString();
        if (!id || id === currentUserId) return;
        if (!peopleMap.has(id)) {
          peopleMap.set(id, { id: person.id, name: person.name, avatar: person.avatar || null, upiId: person.upiId || null });
        }
      });
    });

    const total = activities.length;
    const paginated = activities.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    const monthlyCount = activities.filter((item) => {
      const d = new Date(item.date);
      const n = new Date();
      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
    }).length;

    res.status(200).json({
      success: true,
      activity: paginated,
      groupedByDate: grouped,
      pendingActions,
      insights: {
        totalThisMonth: monthlyCount,
        oweCount: activities.filter((item) => item.status === 'owe').length,
        getCount: activities.filter((item) => item.status === 'get').length
      },
      filters: {
        groups: groups.map((g) => ({ id: g._id, name: g.name })),
        people: [...peopleMap.values()]
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        hasMore: pageNum * limitNum < total
      }
    });
  } catch (error) {
    console.error('Error in getActivity:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching activity' });
  }
};
