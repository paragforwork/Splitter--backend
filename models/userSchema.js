const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // 1. IDENTITY (Linked to Firebase)
  googleId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true // Faster lookups during login
  },
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true 
  },
  phone: { 
    type: String, 
    sparse: true, // Allows null values, but ensures uniqueness if present
    trim: true 
  },
  avatar: { 
    type: String, 
    default: "https://cdn-icons-png.flaticon.com/512/149/149071.png" 
  },

  // 2. PAYMENT DETAILS (Crucial for Settlements)
  upi_id: { 
    type: String, 
    trim: true, 
    default: null 
    // Example: "rahul@okhdfcbank"
    // Used when someone clicks "Pay" on this user's profile
  },
  
  // 3. APP DATA & CACHING
  groups: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Group' 
  }],

  totalBalance: { 
    type: Number, 
    default: 0 
  },

  // 4. NOTIFICATIONS (For Mobile App)
  fcmToken: { 
    type: String, 
    default: null 
    // The "Push Notification ID" from Capacitor 
    // Used to send alerts like: "Rahul added an expense"
  }

}, { 
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true }, 
  toObject: { virtuals: true } 
});

// VIRTUAL: Get all expenses paid by this user
// This allows you to say `user.expensesPaid` without storing the huge array in the DB
UserSchema.virtual('expensesPaid', {
  ref: 'Expense',
  localField: '_id',
  foreignField: 'paid_by'
});

module.exports = mongoose.model('User', UserSchema);