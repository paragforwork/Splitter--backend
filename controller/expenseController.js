const mongoose = require('mongoose');
const Group = require('../models/groupSchema');
const Expense = require('../models/expenseSchema');
const updateSimplifiedDebts = require('../utils/updateSimplifiedDebts');

const toCents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (cents) => Math.round(cents) / 100;

const normalizeSharesToCents = (rawShares, totalAmountCents) => {
  const base = rawShares.map((share) => ({
    user: share.user,
    cents: toCents(share.owedAmount)
  }));

  let sum = base.reduce((acc, s) => acc + s.cents, 0);
  const diff = totalAmountCents - sum;
  if (base.length > 0 && diff !== 0) {
    base[base.length - 1].cents += diff;
    sum = base.reduce((acc, s) => acc + s.cents, 0);
  }

  return { shares: base, sum };
};

exports.createExpense = async (req, res) => {
  try {
    const { groupId, description, amount, paidBy, shares, splitType = 'equal', receiptUrl = null } = req.body;
    const currentUserId = req.user._id.toString();

    if (!groupId || !description || !amount || !paidBy || !Array.isArray(shares) || shares.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const totalAmountCents = toCents(amount);
    if (totalAmountCents <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const groupMemberIds = new Set(group.members.map((memberId) => memberId.toString()));
    if (!groupMemberIds.has(currentUserId)) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    if (!groupMemberIds.has(paidBy.toString())) {
      return res.status(400).json({ success: false, message: 'Paid by user is not a group member' });
    }

    const uniqueUsers = new Set();
    for (const share of shares) {
      if (!share.user || typeof share.owedAmount !== 'number') {
        return res.status(400).json({ success: false, message: 'Invalid share format' });
      }
      const userId = share.user.toString();
      if (!groupMemberIds.has(userId)) {
        return res.status(400).json({ success: false, message: 'All shared users must belong to the group' });
      }
      if (uniqueUsers.has(userId)) {
        return res.status(400).json({ success: false, message: 'Duplicate users in shares are not allowed' });
      }
      uniqueUsers.add(userId);
    }

    if (!uniqueUsers.has(paidBy.toString())) {
      return res.status(400).json({ success: false, message: 'Paid by user must be included in shares' });
    }

    const normalized = normalizeSharesToCents(shares, totalAmountCents);
    if (normalized.sum !== totalAmountCents) {
      return res.status(400).json({ success: false, message: 'Total shares must equal total amount' });
    }

    if (normalized.shares.some((share) => share.cents < 0)) {
      return res.status(400).json({ success: false, message: 'Share values cannot be negative' });
    }

    const expenseShares = normalized.shares.map((share) => ({
      user: share.user,
      owedAmount: fromCents(share.cents),
      paidAmount: share.user.toString() === paidBy.toString() ? fromCents(totalAmountCents) : 0
    }));

    const expense = await Expense.create({
      description: description.trim(),
      amount: fromCents(totalAmountCents),
      group: groupId,
      paidBy,
      splitType,
      shares: expenseShares,
      receiptUrl: receiptUrl || null,
      isSettlement: false
    });

    const newDebts = expenseShares
      .filter((share) => share.user.toString() !== paidBy.toString())
      .filter((share) => toCents(share.owedAmount) > 0)
      .map((share) => ({
        from: share.user,
        to: paidBy,
        amount: share.owedAmount
      }));

    group.simplifyDebts = updateSimplifiedDebts(group.simplifyDebts, newDebts);
    await group.save();

    const populatedExpense = await Expense.findById(expense._id)
      .populate('paidBy', 'name avatar')
      .populate('shares.user', 'name avatar');

    res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      expense: populatedExpense,
      simplifyDebts: group.simplifyDebts
    });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ success: false, message: 'Server error while creating expense' });
  }
};
