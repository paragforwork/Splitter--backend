const express = require('express');
const router = express.Router();
const { authenticate } = require('../controller/authController');
const authMiddleware = require('../middlleware/authMiddleware');

router.post('/authenticate', authenticate);
router.get('/verify', authMiddleware, (req, res) => {
    res.status(200).json({ success: true, user: req.user });
});

module.exports = router;
