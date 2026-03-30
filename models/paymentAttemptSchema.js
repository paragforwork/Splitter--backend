const mongoose = require('mongoose');

const PaymentAttemptSchema = new mongoose.Schema({
  transactionRef: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverUpiId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  note: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'cancelled', 'manual'],
    default: 'pending',
    index: true
  },
  source: {
    type: String,
    default: 'upi'
  },
  linkedExpense: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense',
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('PaymentAttempt', PaymentAttemptSchema);
