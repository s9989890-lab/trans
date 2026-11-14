const express = require('express');
const router = express.Router();
const { getSmartAlerts } = require('../controllers/alertController');

// GET /api/alerts/:year/:month
router.get('/:year/:month', getSmartAlerts);

module.exports = router;
