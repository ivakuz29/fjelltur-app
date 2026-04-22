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

function getTripPayload(tur) {
  if (!tur) {
    return null;
  }

  return {
    ...tur,
    bilder: getImagesForTrip(tur.id)
  };
}

function formatComment(comment) {
  return {
    id: comment.id,
    tur_id: comment.tur_id,
    parent_id: comment.parent_id,
    innhold: comment.innhold,
    opprettet: comment.opprettet,
    bruker: {
      id: comment.bruker_id,
      brukernavn: comment.brukernavn
    },
    replies: []
  };
}

function buildCommentTree(comments) {
  const byId = new Map();
  const roots = [];

  comments.forEach((comment) => {
    byId.set(comment.id, formatComment(comment));
  });

  comments.forEach((comment) => {
    const current = byId.get(comment.id);
    if (comment.parent_id) {
      const parent = byId.get(comment.parent_id);
      if (parent) {
        parent.replies.push(current);
        return;
      }
    }

    roots.push(current);
  });

  return roots;
}

function getCommentsForTrip(turId) {
  const comments = db.prepare(`
    SELECT
      tur_kommentarer.id,
      tur_kommentarer.tur_id,
      tur_kommentarer.parent_id,
      tur_kommentarer.innhold,
      tur_kommentarer.opprettet,
      tur_kommentarer.bruker_id,
      brukere.brukernavn
    FROM tur_kommentarer
    JOIN brukere ON brukere.id = tur_kommentarer.bruker_id
    WHERE tur_kommentarer.tur_id = ?
    ORDER BY tur_kommentarer.opprettet ASC, tur_kommentarer.id ASC
  `).all(turId);

  return buildCommentTree(comments);
}

function deleteImageFile(filename) {
  const filePath = path.join(uploadsDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function parseOptionalTall(value, fieldLabel, options = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (options.required) {
      throw new Error(`${fieldLabel} er p\u00E5krevd.`);
    }

    return null;
  }

  const normalized = raw
    .toLowerCase()
    .replace(',', '.')
    .replace(/\s+/g, '');

  const units = (options.units || []).map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const unitSuffix = units.length ? `(?:${units.join('|')})?` : '';
  const numberPattern = options.integer ? '(\\d+)' : '(\\d+(?:\\.\\d+)?)';
  const match = normalized.match(new RegExp(`^${numberPattern}${unitSuffix}$`));

  if (!match) {
    throw new Error(`${fieldLabel} er ugyldig.`);
  }

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} er ugyldig.`);
  }

  if (options.integer && !Number.isInteger(parsed)) {
    throw new Error(`${fieldLabel} m\u00E5 v\u00E6re et helt tall.`);
  }

  return parsed;
}

router.get('/api/turer', requireAuth, (req, res) => {
  const turer = db
    .prepare('SELECT * FROM fjellturer WHERE bruker_id = ? ORDER BY dato DESC')
    .all(req.session.bruker.id);

  res.json(turer.map(getTripPayload));
});

router.get('/api/turer/:id', requireAuth, (req, res) => {
  const tur = getTripForUser(req.params.id, req.session.bruker.id);

  if (!tur) {
    res.status(404).json({ ok: false, melding: 'Tur ikke funnet.' });
    return;
  }

  res.json({
    ok: true,
    tur: getTripPayload(tur),
    kommentarer: getCommentsForTrip(tur.id)
  });
});

router.post('/api/turer', requireAuth, (req, res) => {
  const { fjell, dato, distanse, hoyde, notat } = req.body;
  console.info('[tripRoutes] POST /api/turer body', req.body);

  if (!fjell || !dato) {
    res.json({ ok: false, melding: 'Fjell og dato er p\u00E5krevd.' });
    return;
  }

  let parsedDistanse;
  let parsedHoyde;
  try {
    parsedDistanse = parseOptionalTall(distanse, 'Distanse', { units: ['km'] });
    parsedHoyde = parseOptionalTall(hoyde, 'H\u00F8yde', { required: true, integer: true, units: ['m', 'moh'] });
  } catch (error) {
    console.error('[tripRoutes] POST /api/turer parse error', {
      body: req.body,
      message: error.message
    });
    res.json({ ok: false, melding: error.message });
    return;
  }

  console.info('[tripRoutes] POST /api/turer parsed', {
    fjell,
    dato,
    parsedDistanse,
    parsedHoyde
  });

  const result = db.prepare(
    'INSERT INTO fjellturer (fjell, dato, distanse, hoyde, notat, bruker_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(fjell, dato, parsedDistanse, parsedHoyde, notat || '', req.session.bruker.id);

  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/api/turer/:id', requireAuth, (req, res) => {
  const { fjell, dato, distanse, hoyde, notat } = req.body;
  const { id } = req.params;
  console.info(`[tripRoutes] PUT /api/turer/${id} body`, req.body);

  const tur = getTripForUser(id, req.session.bruker.id);
  if (!tur) {
    res.json({ ok: false, melding: 'Tur ikke funnet.' });
    return;
  }

  let parsedDistanse;
  let parsedHoyde;
  try {
    parsedDistanse = parseOptionalTall(distanse, 'Distanse', { units: ['km'] });
    parsedHoyde = parseOptionalTall(hoyde, 'H\u00F8yde', { required: true, integer: true, units: ['m', 'moh'] });
  } catch (error) {
    console.error(`[tripRoutes] PUT /api/turer/${id} parse error`, {
      body: req.body,
      message: error.message
    });
    res.json({ ok: false, melding: error.message });
    return;
  }

  console.info(`[tripRoutes] PUT /api/turer/${id} parsed`, {
    fjell,
    dato,
    parsedDistanse,
    parsedHoyde
  });

  db.prepare(
    'UPDATE fjellturer SET fjell = ?, dato = ?, distanse = ?, hoyde = ?, notat = ? WHERE id = ?'
  ).run(fjell, dato, parsedDistanse, parsedHoyde, notat || '', id);

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
  db.prepare('DELETE FROM tur_kommentarer WHERE tur_id = ?').run(id);
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

router.post('/api/turer/:id/kommentarer', requireAuth, (req, res) => {
  const { id } = req.params;
  const { innhold, parentId } = req.body;
  const tur = getTripForUser(id, req.session.bruker.id);

  if (!tur) {
    res.status(404).json({ ok: false, melding: 'Tur ikke funnet.' });
    return;
  }

  const cleanInnhold = String(innhold ?? '').trim();
  if (!cleanInnhold) {
    res.json({ ok: false, melding: 'Kommentaren kan ikke v\u00E6re tom.' });
    return;
  }

  let parsedParentId = null;
  if (parentId !== undefined && parentId !== null && String(parentId).trim() !== '') {
    parsedParentId = Number(parentId);
    if (!Number.isInteger(parsedParentId) || parsedParentId < 1) {
      res.json({ ok: false, melding: 'Ugyldig svar-kommentar.' });
      return;
    }

    const parentComment = db.prepare(`
      SELECT id
      FROM tur_kommentarer
      WHERE id = ? AND tur_id = ?
    `).get(parsedParentId, id);

    if (!parentComment) {
      res.json({ ok: false, melding: 'Kommentaren du svarer p\u00E5 finnes ikke.' });
      return;
    }
  }

  db.prepare(`
    INSERT INTO tur_kommentarer (tur_id, bruker_id, parent_id, innhold)
    VALUES (?, ?, ?, ?)
  `).run(id, req.session.bruker.id, parsedParentId, cleanInnhold);

  res.json({
    ok: true,
    kommentarer: getCommentsForTrip(id)
  });
});

module.exports = router;
