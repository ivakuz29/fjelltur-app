const express = require('express');
const fs = require('fs');
const path = require('path');

const db = require('../../database');
const { upload, uploadsDir } = require('../config/uploads');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

function getTripForUser(id, brukerId) {
  return db.prepare('SELECT * FROM fjellturer WHERE id = ? AND bruker_id = ?').get(id, brukerId);
}

function getImagesForTrip(turId) {
  return db.prepare('SELECT id, filnavn FROM tur_bilder WHERE tur_id = ?').all(turId);
}

function deleteImageFile(filename) {
  const filePath = path.join(uploadsDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

router.get('/api/turer', requireAuth, (req, res) => {
  const turer = db
    .prepare('SELECT * FROM fjellturer WHERE bruker_id = ? ORDER BY dato DESC')
    .all(req.session.bruker.id);

  res.json(turer.map((tur) => ({
    ...tur,
    bilder: getImagesForTrip(tur.id)
  })));
});

router.post('/api/turer', requireAuth, (req, res) => {
  const { fjell, dato, distanse, hoyde, notat } = req.body;

  if (!fjell || !dato) {
    res.json({ ok: false, melding: 'Fjell og dato er p\u00E5krevd.' });
    return;
  }

  const result = db.prepare(
    'INSERT INTO fjellturer (fjell, dato, distanse, hoyde, notat, bruker_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(fjell, dato, distanse || null, hoyde || null, notat || '', req.session.bruker.id);

  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/api/turer/:id', requireAuth, (req, res) => {
  const { fjell, dato, distanse, hoyde, notat } = req.body;
  const { id } = req.params;

  const tur = getTripForUser(id, req.session.bruker.id);
  if (!tur) {
    res.json({ ok: false, melding: 'Tur ikke funnet.' });
    return;
  }

  db.prepare(
    'UPDATE fjellturer SET fjell = ?, dato = ?, distanse = ?, hoyde = ?, notat = ? WHERE id = ?'
  ).run(fjell, dato, distanse || null, hoyde || null, notat || '', id);

  res.json({ ok: true });
});

router.delete('/api/turer/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const tur = getTripForUser(id, req.session.bruker.id);

  if (!tur) {
    res.json({ ok: false, melding: 'Tur ikke funnet.' });
    return;
  }

  db.prepare('SELECT filnavn FROM tur_bilder WHERE tur_id = ?').all(id).forEach((bilde) => {
    deleteImageFile(bilde.filnavn);
  });

  db.prepare('DELETE FROM tur_bilder WHERE tur_id = ?').run(id);
  db.prepare('DELETE FROM fjellturer WHERE id = ?').run(id);

  res.json({ ok: true });
});

router.post('/api/turer/:id/bilder', requireAuth, upload.array('bilder', 20), (req, res) => {
  const { id } = req.params;
  const tur = getTripForUser(id, req.session.bruker.id);

  if (!tur) {
    (req.files || []).forEach((file) => {
      deleteImageFile(path.basename(file.path));
    });

    res.json({ ok: false, melding: 'Tur ikke funnet.' });
    return;
  }

  const insert = db.prepare('INSERT INTO tur_bilder (tur_id, filnavn) VALUES (?, ?)');
  const bilder = (req.files || []).map((file) => {
    const result = insert.run(id, file.filename);
    return { id: result.lastInsertRowid, filnavn: file.filename };
  });

  res.json({ ok: true, bilder });
});

router.delete('/api/turer/:id/bilder/:bildeid', requireAuth, (req, res) => {
  const { id, bildeid } = req.params;
  const tur = getTripForUser(id, req.session.bruker.id);

  if (!tur) {
    res.json({ ok: false, melding: 'Tur ikke funnet.' });
    return;
  }

  const bilde = db.prepare('SELECT * FROM tur_bilder WHERE id = ? AND tur_id = ?').get(bildeid, id);
  if (!bilde) {
    res.json({ ok: false, melding: 'Bilde ikke funnet.' });
    return;
  }

  deleteImageFile(bilde.filnavn);
  db.prepare('DELETE FROM tur_bilder WHERE id = ?').run(bildeid);

  res.json({ ok: true });
});

module.exports = router;
