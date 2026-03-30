const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlleware/authMiddleware');
const { createExpense } = require('../controller/expenseController');

router.post('/', authMiddleware, createExpense);

module.exports = router;
