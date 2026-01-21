const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
  // 1. BASICS
  description: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  
  // 2. RELATIONSHIPS
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // 3. THE SPLIT LOGIC (The Heart of the App)
  // This array defines exactly how much each person is responsible for.
  shares: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // How much this person "consumed"
    owedAmount: { type: Number, required: true },
    
    // Did they pay anything upfront? (Usually 0, unless multiple people paid)
    paidAmount: { type: Number, default: 0 } 
  }],

  // 4. FLAGS
  isSettlement: {
    type: Boolean,
    default: false
  }, 
  // If true, this isn't a bill. It's User A paying back User B.
  // Logic: "paidBy" gives money to "shares[0].user".

  // 5. ATTACHMENTS (For your Capacitor Camera feature)
  receiptUrl: {
    type: String,
    default: null
  }

}, { timestamps: true });

module.exports = mongoose.model('Expense', ExpenseSchema);