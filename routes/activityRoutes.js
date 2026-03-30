const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlleware/authMiddleware');
const { getActivity } = require('../controller/activityController');

router.get('/', authMiddleware, getActivity);

module.exports = router;
