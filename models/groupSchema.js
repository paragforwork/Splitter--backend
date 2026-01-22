const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  // Optional: "Trip to Goa", "Apartment Rent"
  type: {
    type: String,
    enum: ['TRIP', 'HOME', 'COUPLE', 'OTHER'],
    default: 'OTHER'
  },
  avatar: {
    type: String, 
    default: "https://cdn-icons-png.flaticon.com/512/1256/1256650.png"
  },
  
  // Who belongs to this group?
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // CREATOR (Admin)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // PERFORMANCE CACH
  // Stores "Who owes whom" inside this specific group.
  // Updated every time an expense is added.
  // Example: [{ from: UserA, to: UserB, amount: 500 }]
  simplifyDebts: [{
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number }
  }]

}, { timestamps: true });

module.exports = mongoose.model('Group', GroupSchema);