const crypto = require('crypto');
const Group = require('../models/groupSchema');
const Expense = require('../models/expenseSchema');
const PaymentAttempt = require('../models/paymentAttemptSchema');
const updateSimplifiedDebts = require('../utils/updateSimplifiedDebts');

const toCents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (value) => Math.round(value) / 100;
const sanitizeTxnNote = (value) =>
  String(value || 'Splitter settlement')
    .replace(/[^\w\s.,\-()/]/g, ' ')
    .trim()
    .slice(0, 60);

const createTxnRef = () => {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `SPLT-${Date.now()}-${random}`;
};

const validateUpi = (upiId) => /^[a-z0-9.\-_]{2,}@[a-z]{2,}$/i.test(String(upiId || '').trim());

exports.createPaymentIntent = async (req, res) => {
  try {
    const { groupId, receiverId, upiId, amount, note } = req.body;
    const senderId = req.user._id.toString();
    const amountCents = toCents(amount);

    if (!groupId || !receiverId || !upiId || !note || amountCents <= 0) {
      return res.status(400).json({ success: false, message: 'Missing required payment details' });
    }
    if (!validateUpi(upiId)) {
      return res.status(400).json({ success: false, message: 'Invalid UPI ID format' });
    }
    if (receiverId === senderId) {
      return res.status(400).json({ success: false, message: 'Sender and receiver cannot be same' });
    }

    const group = await Group.findById(groupId).populate('members', 'name upi_id');
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const memberSet = new Set(group.members.map((member) => member._id.toString()));
    if (!memberSet.has(senderId) || !memberSet.has(receiverId.toString())) {
      return res.status(403).json({ success: false, message: 'Users must be members of this group' });
    }

    const transactionRef = createTxnRef();
    const amountValue = fromCents(amountCents).toFixed(2);
    await PaymentAttempt.create({
      transactionRef,
      group: groupId,
      sender: senderId,
      receiver: receiverId,
      receiverUpiId: upiId,
      amount: fromCents(amountCents),
      note,
      status: 'pending',
      source: 'upi'
    });
    const receiverName = group.members.find((m) => m._id.toString() === receiverId.toString())?.name || 'Receiver';
    const params = new URLSearchParams({
      pa: String(upiId).trim(),
      pn: receiverName,
      am: amountValue,
      cu: 'INR',
      tn: sanitizeTxnNote(note),
    });
    // NOTE: We intentionally do not send `tr` in deep-link because some UPI/bank
    // combinations apply stricter limits or reject P2P with merchant-like refs.
    const upiLink = `upi://pay?${params.toString()}`;

    res.status(200).json({
      success: true,
      transactionRef,
      upiLink,
      payload: {
        groupId,
        senderId,
        receiverId,
        amount: fromCents(amountCents),
        note
      }
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ success: false, message: 'Server error while creating payment intent' });
  }
};

exports.confirmSettlementPayment = async (req, res) => {
  try {
    const { groupId, receiverId, amount, note, transactionRef, status, source = 'manual' } = req.body;
    const senderId = req.user._id.toString();
    const amountCents = toCents(amount);

    if (!groupId || !receiverId || !transactionRef || !status || amountCents <= 0) {
      return res.status(400).json({ success: false, message: 'Missing required confirmation fields' });
    }

    const normalizedStatus = String(status).toUpperCase();
    const successStatuses = new Set(['SUCCESS', 'SUBMITTED', 'YES']);
    const failedStatuses = new Set(['FAILURE', 'FAILED', 'NO', 'CANCELLED']);
    const paymentStatus = successStatuses.has(normalizedStatus) ? 'success' : failedStatuses.has(normalizedStatus) ? 'failed' : 'manual';

    const existing = await Expense.findOne({ transactionRef });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Duplicate transaction reference', expenseId: existing._id });
    }

    let attempt = await PaymentAttempt.findOne({ transactionRef });
    if (!attempt) {
      attempt = await PaymentAttempt.create({
        transactionRef,
        group: groupId,
        sender: senderId,
        receiver: receiverId,
        receiverUpiId: 'manual@local',
        amount: fromCents(amountCents),
        note: note || 'Manual settlement confirmation',
        status: 'pending',
        source
      });
    }

    if (attempt.sender.toString() !== senderId) {
      return res.status(403).json({ success: false, message: 'Not authorized for this transaction reference' });
    }

    if (paymentStatus !== 'success' && paymentStatus !== 'manual') {
      const nextStatus = normalizedStatus === 'NO' || normalizedStatus === 'CANCELLED' ? 'cancelled' : 'failed';
      attempt.status = nextStatus;
      attempt.source = source;
      await attempt.save();
      return res.status(200).json({ success: true, message: 'Payment not completed. Settlement not recorded.', paymentStatus: nextStatus });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const memberSet = new Set(group.members.map((member) => member.toString()));
    if (!memberSet.has(senderId) || !memberSet.has(receiverId.toString())) {
      return res.status(403).json({ success: false, message: 'Users must be members of this group' });
    }

    const expense = await Expense.create({
      description: note || 'Settlement payment',
      amount: fromCents(amountCents),
      splitType: 'exact',
      group: groupId,
      paidBy: senderId,
      shares: [
        { user: receiverId, owedAmount: fromCents(amountCents), paidAmount: 0 },
        { user: senderId, owedAmount: 0, paidAmount: fromCents(amountCents) }
      ],
      isSettlement: true,
      transactionRef,
      paymentStatus: paymentStatus,
      receiptUrl: null
    });

    group.simplifyDebts = updateSimplifiedDebts(group.simplifyDebts, [
      { from: senderId, to: receiverId, amount: fromCents(amountCents) }
    ]);
    await group.save();

    attempt.status = paymentStatus;
    attempt.source = source;
    attempt.linkedExpense = expense._id;
    await attempt.save();

    res.status(201).json({
      success: true,
      message: 'Settlement recorded successfully',
      paymentStatus,
      expenseId: expense._id,
      simplifyDebts: group.simplifyDebts
    });
  } catch (error) {
    console.error('Error confirming settlement payment:', error);
    res.status(500).json({ success: false, message: 'Server error while confirming settlement' });
  }
};

exports.getPaymentHistory = async (req, res) => {
  try {
    const { groupId, limit = 20, status } = req.query;
    const userId = req.user._id.toString();

    const query = {
      sender: userId
    };

    if (groupId) query.group = groupId;
    if (status) query.status = String(status).toLowerCase();

    const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const history = await PaymentAttempt.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .populate('receiver', 'name avatar upi_id')
      .populate('group', 'name')
      .lean();

    res.status(200).json({
      success: true,
      history: history.map((row) => ({
        id: row._id,
        transactionRef: row.transactionRef,
        amount: row.amount,
        note: row.note,
        status: row.status,
        source: row.source,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        receiver: row.receiver ? {
          id: row.receiver._id,
          name: row.receiver.name,
          avatar: row.receiver.avatar || null,
          upi_id: row.receiver.upi_id || null
        } : null,
        group: row.group ? { id: row.group._id, name: row.group.name } : null
      }))
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching payment history' });
  }
};
