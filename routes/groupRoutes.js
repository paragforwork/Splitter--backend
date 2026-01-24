const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlleware/authMiddleware');
const { createGroup, getGroup, getGroups } = require('../controller/groupController');

router.post('/', authMiddleware, createGroup);
router.get('/allgroups', authMiddleware, getGroups);
router.get('/:id', authMiddleware, getGroup);
module.exports = router;