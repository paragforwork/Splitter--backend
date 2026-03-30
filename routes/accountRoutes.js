const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlleware/authMiddleware');
const {
  getOverview,
  updateProfile,
  updateUpi,
  updateNotificationSettings
} = require('../controller/accountController');

router.get('/overview', authMiddleware, getOverview);
router.put('/profile', authMiddleware, updateProfile);
router.put('/upi', authMiddleware, updateUpi);
router.put('/notifications', authMiddleware, updateNotificationSettings);

module.exports = router;
