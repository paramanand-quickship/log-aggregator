'use strict';
const { Router } = require('express');
const StreamController = require('../controllers/StreamController');
const { authenticate } = require('../middleware/auth');

const router = Router();
const ctrl = new StreamController();

router.get('/', authenticate, (req, res) => ctrl.stream(req, res));

module.exports = router;
