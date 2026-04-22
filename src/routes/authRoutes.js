const express = require('express');
const bcrypt = require('bcrypt');

const db = require('../../database');

const router = express.Router();

router.post('/api/registrer', async (req, res) => {
  const { brukernavn, passord } = req.body;

  if (!brukernavn || !passord) {
    res.json({ ok: false, melding: 'Fyll inn alle felt.' });
    return;
  }

  const eksisterer = db.prepare('SELECT id FROM brukere WHERE brukernavn = ?').get(brukernavn);
  if (eksisterer) {
    res.json({ ok: false, melding: 'Brukernavnet er allerede tatt.' });
    return;
  }

  const hashet = await bcrypt.hash(passord, 10);
  db.prepare('INSERT INTO brukere (brukernavn, passord) VALUES (?, ?)').run(brukernavn, hashet);

  res.json({ ok: true, melding: 'Bruker opprettet! Du kan n\u00E5 logge inn.' });
});

router.post('/api/login', async (req, res) => {
  const { brukernavn, passord } = req.body;
  const bruker = db.prepare('SELECT * FROM brukere WHERE brukernavn = ?').get(brukernavn);

  if (!bruker) {
    res.json({ ok: false, melding: 'Feil brukernavn eller passord.' });
    return;
  }

  const riktig = await bcrypt.compare(passord, bruker.passord);
  if (!riktig) {
    res.json({ ok: false, melding: 'Feil brukernavn eller passord.' });
    return;
  }

  req.session.bruker = { id: bruker.id, brukernavn: bruker.brukernavn };
  res.json({ ok: true });
});

router.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/api/meg', (req, res) => {
  if (req.session.bruker) {
    res.json({ ok: true, bruker: req.session.bruker });
    return;
  }

  res.json({ ok: false });
});

module.exports = router;
