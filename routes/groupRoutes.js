const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlleware/authMiddleware');
const {
  createGroup,
  getGroup,
  getGroups,
  joinGroup,
  getGroupMembers,
  getMemberTransactions
} = require('../controller/groupController');

router.post('/', authMiddleware, createGroup);
router.get('/allgroups', authMiddleware, getGroups);
router.get('/:id', authMiddleware, getGroup);
router.get('/:id/members', authMiddleware, getGroupMembers);
router.get('/:id/members/:memberId/transactions', authMiddleware, getMemberTransactions);
router.post('/join',authMiddleware, joinGroup);
module.exports = router;
