const express = require('express');
const path = require('path');

const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const viewsDir = path.join(__dirname, '..', '..', 'views');

router.get('/', (req, res) => {
  if (req.session.bruker) {
    res.redirect('/turer');
    return;
  }

  res.sendFile(path.join(viewsDir, 'login.html'));
});

router.get('/registrer', (req, res) => {
  res.sendFile(path.join(viewsDir, 'registrer.html'));
});

router.get('/turer', requireAuth, (req, res) => {
  res.sendFile(path.join(viewsDir, 'turer.html'));
});

module.exports = router;
