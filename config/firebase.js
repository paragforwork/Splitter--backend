// backend/config/firebase.js
const admin = require('firebase-admin');

// 1. Load the file you just downloaded
const serviceAccount = require('./service-account.json'); 

// 2. Initialize the "Master Access"
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log("Firebase Admin Initialized");

module.exports = admin;