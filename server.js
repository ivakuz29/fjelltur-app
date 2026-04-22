const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'hemmelig-nøkkel-123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 } // 1 time
}));

// Sjekk om bruker er innlogget
function kreverInnlogging(req, res, next) {
  if (!req.session.bruker) {
    return res.redirect('/');
  }
  next();
}

// ==================== SIDER ====================

// Startside / login-side
app.get('/', (req, res) => {
  if (req.session.bruker) {
    return res.redirect('/turer');
  }
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Registreringsside
app.get('/registrer', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'registrer.html'));
});

// Turer-side (krever innlogging)
app.get('/turer', kreverInnlogging, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'turer.html'));
});

// ==================== AUTH ====================

// Registrer ny bruker
app.post('/api/registrer', async (req, res) => {
  const { brukernavn, passord } = req.body;

  if (!brukernavn || !passord) {
    return res.json({ ok: false, melding: 'Fyll inn alle felt.' });
  }

  const eksisterer = db.prepare('SELECT id FROM brukere WHERE brukernavn = ?').get(brukernavn);
  if (eksisterer) {
    return res.json({ ok: false, melding: 'Brukernavnet er allerede tatt.' });
  }

  const hashet = await bcrypt.hash(passord, 10);
  db.prepare('INSERT INTO brukere (brukernavn, passord) VALUES (?, ?)').run(brukernavn, hashet);

  res.json({ ok: true, melding: 'Bruker opprettet! Du kan nå logge inn.' });
});

// Logg inn
app.post('/api/login', async (req, res) => {
  const { brukernavn, passord } = req.body;

  const bruker = db.prepare('SELECT * FROM brukere WHERE brukernavn = ?').get(brukernavn);
  if (!bruker) {
    return res.json({ ok: false, melding: 'Feil brukernavn eller passord.' });
  }

  const riktig = await bcrypt.compare(passord, bruker.passord);
  if (!riktig) {
    return res.json({ ok: false, melding: 'Feil brukernavn eller passord.' });
  }

  req.session.bruker = { id: bruker.id, brukernavn: bruker.brukernavn };
  res.json({ ok: true });
});

// Logg ut
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// Hvem er innlogget?
app.get('/api/meg', (req, res) => {
  if (req.session.bruker) {
    res.json({ ok: true, bruker: req.session.bruker });
  } else {
    res.json({ ok: false });
  }
});

// ==================== CRUD TURER ====================

// Hent alle turer for innlogget bruker
app.get('/api/turer', kreverInnlogging, (req, res) => {
  const turer = db.prepare('SELECT * FROM fjellturer WHERE bruker_id = ? ORDER BY dato DESC').all(req.session.bruker.id);
  res.json(turer);
});

// Legg til ny tur (Create)
app.post('/api/turer', kreverInnlogging, (req, res) => {
  const { fjell, dato, distanse, notat } = req.body;

  if (!fjell || !dato) {
    return res.json({ ok: false, melding: 'Fjell og dato er påkrevd.' });
  }

  const result = db.prepare(
    'INSERT INTO fjellturer (fjell, dato, distanse, notat, bruker_id) VALUES (?, ?, ?, ?, ?)'
  ).run(fjell, dato, distanse || null, notat || '', req.session.bruker.id);

  res.json({ ok: true, id: result.lastInsertRowid });
});

// Oppdater tur (Update)
app.put('/api/turer/:id', kreverInnlogging, (req, res) => {
  const { fjell, dato, distanse, notat } = req.body;
  const { id } = req.params;

  const tur = db.prepare('SELECT * FROM fjellturer WHERE id = ? AND bruker_id = ?').get(id, req.session.bruker.id);
  if (!tur) {
    return res.json({ ok: false, melding: 'Tur ikke funnet.' });
  }

  db.prepare(
    'UPDATE fjellturer SET fjell = ?, dato = ?, distanse = ?, notat = ? WHERE id = ?'
  ).run(fjell, dato, distanse || null, notat || '', id);

  res.json({ ok: true });
});

// Slett tur (Delete)
app.delete('/api/turer/:id', kreverInnlogging, (req, res) => {
  const { id } = req.params;

  const tur = db.prepare('SELECT * FROM fjellturer WHERE id = ? AND bruker_id = ?').get(id, req.session.bruker.id);
  if (!tur) {
    return res.json({ ok: false, melding: 'Tur ikke funnet.' });
  }

  db.prepare('DELETE FROM fjellturer WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server kjører på http://localhost:${PORT}`);
});
