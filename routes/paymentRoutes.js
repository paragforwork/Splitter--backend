const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlleware/authMiddleware');
const { createPaymentIntent, confirmSettlementPayment, getPaymentHistory } = require('../controller/paymentController');

router.post('/intent', authMiddleware, createPaymentIntent);
router.post('/confirm', authMiddleware, confirmSettlementPayment);
router.get('/history', authMiddleware, getPaymentHistory);

module.exports = router;
