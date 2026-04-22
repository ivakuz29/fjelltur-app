const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const db = require('./database');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Opprett uploads-mappe hvis den ikke finnes
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer for bildeopplasting
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Kun bilder er tillatt'));
  }
});

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

app.get('/', (req, res) => {
  if (req.session.bruker) return res.redirect('/turer');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/registrer', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'registrer.html'));
});

app.get('/turer', kreverInnlogging, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'turer.html'));
});

// ==================== AUTH ====================

app.post('/api/registrer', async (req, res) => {
  const { brukernavn, passord } = req.body;
  if (!brukernavn || !passord) return res.json({ ok: false, melding: 'Fyll inn alle felt.' });

  const eksisterer = db.prepare('SELECT id FROM brukere WHERE brukernavn = ?').get(brukernavn);
  if (eksisterer) return res.json({ ok: false, melding: 'Brukernavnet er allerede tatt.' });

  const hashet = await bcrypt.hash(passord, 10);
  db.prepare('INSERT INTO brukere (brukernavn, passord) VALUES (?, ?)').run(brukernavn, hashet);
  res.json({ ok: true, melding: 'Bruker opprettet! Du kan nå logge inn.' });
});

app.post('/api/login', async (req, res) => {
  const { brukernavn, passord } = req.body;
  const bruker = db.prepare('SELECT * FROM brukere WHERE brukernavn = ?').get(brukernavn);
  if (!bruker) return res.json({ ok: false, melding: 'Feil brukernavn eller passord.' });

  const riktig = await bcrypt.compare(passord, bruker.passord);
  if (!riktig) return res.json({ ok: false, melding: 'Feil brukernavn eller passord.' });

  req.session.bruker = { id: bruker.id, brukernavn: bruker.brukernavn };
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/meg', (req, res) => {
  if (req.session.bruker) res.json({ ok: true, bruker: req.session.bruker });
  else res.json({ ok: false });
});

// ==================== CRUD TURER ====================

app.get('/api/turer', kreverInnlogging, (req, res) => {
  const turer = db.prepare('SELECT * FROM fjellturer WHERE bruker_id = ? ORDER BY dato DESC').all(req.session.bruker.id);
  const turer_med_bilder = turer.map(tur => {
    const bilder = db.prepare('SELECT id, filnavn FROM tur_bilder WHERE tur_id = ?').all(tur.id);
    return { ...tur, bilder };
  });
  res.json(turer_med_bilder);
});

app.post('/api/turer', kreverInnlogging, (req, res) => {
  const { fjell, dato, distanse, notat } = req.body;
  if (!fjell || !dato) return res.json({ ok: false, melding: 'Fjell og dato er påkrevd.' });

  const result = db.prepare(
    'INSERT INTO fjellturer (fjell, dato, distanse, notat, bruker_id) VALUES (?, ?, ?, ?, ?)'
  ).run(fjell, dato, distanse || null, notat || '', req.session.bruker.id);

  res.json({ ok: true, id: result.lastInsertRowid });
});

app.put('/api/turer/:id', kreverInnlogging, (req, res) => {
  const { fjell, dato, distanse, notat } = req.body;
  const { id } = req.params;

  const tur = db.prepare('SELECT * FROM fjellturer WHERE id = ? AND bruker_id = ?').get(id, req.session.bruker.id);
  if (!tur) return res.json({ ok: false, melding: 'Tur ikke funnet.' });

  db.prepare(
    'UPDATE fjellturer SET fjell = ?, dato = ?, distanse = ?, notat = ? WHERE id = ?'
  ).run(fjell, dato, distanse || null, notat || '', id);

  res.json({ ok: true });
});

app.delete('/api/turer/:id', kreverInnlogging, (req, res) => {
  const { id } = req.params;
  const tur = db.prepare('SELECT * FROM fjellturer WHERE id = ? AND bruker_id = ?').get(id, req.session.bruker.id);
  if (!tur) return res.json({ ok: false, melding: 'Tur ikke funnet.' });

  // Slett bildefiler fra disk
  const bilder = db.prepare('SELECT filnavn FROM tur_bilder WHERE tur_id = ?').all(id);
  bilder.forEach(b => {
    const filsti = path.join(uploadsDir, b.filnavn);
    if (fs.existsSync(filsti)) fs.unlinkSync(filsti);
  });

  db.prepare('DELETE FROM tur_bilder WHERE tur_id = ?').run(id);
  db.prepare('DELETE FROM fjellturer WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ==================== BILDER ====================

app.post('/api/turer/:id/bilder', kreverInnlogging, upload.array('bilder', 20), (req, res) => {
  const { id } = req.params;
  const tur = db.prepare('SELECT * FROM fjellturer WHERE id = ? AND bruker_id = ?').get(id, req.session.bruker.id);

  if (!tur) {
    req.files.forEach(f => fs.unlinkSync(f.path));
    return res.json({ ok: false, melding: 'Tur ikke funnet.' });
  }

  const insert = db.prepare('INSERT INTO tur_bilder (tur_id, filnavn) VALUES (?, ?)');
  const bilder = req.files.map(f => {
    const result = insert.run(id, f.filename);
    return { id: result.lastInsertRowid, filnavn: f.filename };
  });

  res.json({ ok: true, bilder });
});

app.delete('/api/turer/:id/bilder/:bildeid', kreverInnlogging, (req, res) => {
  const { id, bildeid } = req.params;
  const tur = db.prepare('SELECT * FROM fjellturer WHERE id = ? AND bruker_id = ?').get(id, req.session.bruker.id);
  if (!tur) return res.json({ ok: false, melding: 'Tur ikke funnet.' });

  const bilde = db.prepare('SELECT * FROM tur_bilder WHERE id = ? AND tur_id = ?').get(bildeid, id);
  if (!bilde) return res.json({ ok: false, melding: 'Bilde ikke funnet.' });

  const filsti = path.join(uploadsDir, bilde.filnavn);
  if (fs.existsSync(filsti)) fs.unlinkSync(filsti);

  db.prepare('DELETE FROM tur_bilder WHERE id = ?').run(bildeid);
  res.json({ ok: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server kjører på http://localhost:${PORT}`);
});
