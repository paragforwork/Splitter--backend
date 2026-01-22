const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlleware/authMiddleware');
const { createGroup, getGroup } = require('../controller/groupController');

router.post('/', authMiddleware, createGroup);
router.get('/:id', authMiddleware, getGroup);

module.exports = router;