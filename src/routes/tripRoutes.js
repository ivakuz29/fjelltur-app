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

function canAccessTrip(turId, brukerId) {
  return db.prepare(`
    SELECT id FROM fjellturer
    WHERE id = ? AND (
      bruker_id = ?
      OR id IN (SELECT tur_id FROM tur_deltakere WHERE bruker_id = ?)
    )
  `).get(turId, brukerId, brukerId);
}

function getImagesForTrip(turId) {
  return db.prepare('SELECT id, filnavn FROM tur_bilder WHERE tur_id = ?').all(turId);
}

function getParticipantsForTrip(turId) {
  return db.prepare(`
    SELECT brukere.id, brukere.brukernavn
    FROM tur_deltakere
    JOIN brukere ON brukere.id = tur_deltakere.bruker_id
    WHERE tur_deltakere.tur_id = ?
    ORDER BY brukere.brukernavn ASC
  `).all(turId);
}

function getTripPayload(tur, requestingBrukerId) {
  if (!tur) {
    return null;
  }

  return {
    ...tur,
    eier: requestingBrukerId !== undefined ? tur.bruker_id === requestingBrukerId : undefined,
    bilder: getImagesForTrip(tur.id),
    deltakere: getParticipantsForTrip(tur.id)
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
      throw new Error(`${fieldLabel} er påkrevd.`);
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
    throw new Error(`${fieldLabel} må være et helt tall.`);
  }

  return parsed;
}

// --- Trip list: own trips + trips where tagged ---
router.get('/api/turer', requireAuth, (req, res) => {
  const brukerId = req.session.bruker.id;

  const egne = db
    .prepare('SELECT * FROM fjellturer WHERE bruker_id = ? ORDER BY dato DESC')
    .all(brukerId);

  const taggede = db.prepare(`
    SELECT fjellturer.*
    FROM fjellturer
    JOIN tur_deltakere ON tur_deltakere.tur_id = fjellturer.id
    WHERE tur_deltakere.bruker_id = ?
    ORDER BY fjellturer.dato DESC
  `).all(brukerId);

  res.json({
    egne: egne.map((t) => getTripPayload(t, brukerId)),
    taggede: taggede.map((t) => getTripPayload(t, brukerId))
  });
});

// --- Single trip: owner or tagged participant can view ---
router.get('/api/turer/:id', requireAuth, (req, res) => {
  const brukerId = req.session.bruker.id;
  const access = canAccessTrip(req.params.id, brukerId);

  if (!access) {
    res.status(404).json({ ok: false, melding: 'Tur ikke funnet.' });
    return;
  }

  const tur = db.prepare('SELECT * FROM fjellturer WHERE id = ?').get(req.params.id);

  res.json({
    ok: true,
    tur: getTripPayload(tur, brukerId),
    kommentarer: tur.offentlig ? getCommentsForTrip(tur.id) : []
  });
});

router.post('/api/turer', requireAuth, (req, res) => {
  const { fjell, dato, distanse, hoyde, notat, offentlig } = req.body;
  console.info('[tripRoutes] POST /api/turer body', req.body);

  if (!fjell || !dato) {
    res.json({ ok: false, melding: 'Fjell og dato er påkrevd.' });
    return;
  }

  let parsedDistanse;
  let parsedHoyde;
  try {
    parsedDistanse = parseOptionalTall(distanse, 'Distanse', { units: ['km'] });
    parsedHoyde = parseOptionalTall(hoyde, 'Høyde', { required: true, integer: true, units: ['m', 'moh'] });
  } catch (error) {
    console.error('[tripRoutes] POST /api/turer parse error', {
      body: req.body,
      message: error.message
    });
    res.json({ ok: false, melding: error.message });
    return;
  }

  const result = db.prepare(
    'INSERT INTO fjellturer (fjell, dato, distanse, hoyde, notat, offentlig, bruker_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(fjell, dato, parsedDistanse, parsedHoyde, notat || '', offentlig ? 1 : 0, req.session.bruker.id);

  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/api/turer/:id', requireAuth, (req, res) => {
  const { fjell, dato, distanse, hoyde, notat, offentlig } = req.body;
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
    parsedHoyde = parseOptionalTall(hoyde, 'Høyde', { required: true, integer: true, units: ['m', 'moh'] });
  } catch (error) {
    console.error(`[tripRoutes] PUT /api/turer/${id} parse error`, {
      body: req.body,
      message: error.message
    });
    res.json({ ok: false, melding: error.message });
    return;
  }

  db.prepare(
    'UPDATE fjellturer SET fjell = ?, dato = ?, distanse = ?, hoyde = ?, notat = ?, offentlig = ? WHERE id = ?'
  ).run(fjell, dato, parsedDistanse, parsedHoyde, notat || '', offentlig ? 1 : 0, id);

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

  db.prepare('DELETE FROM tur_deltakere WHERE tur_id = ?').run(id);
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

// --- Comments: only allowed on public trips ---
router.post('/api/turer/:id/kommentarer', requireAuth, (req, res) => {
  const { id } = req.params;
  const { innhold, parentId } = req.body;
  const brukerId = req.session.bruker.id;

  const access = canAccessTrip(id, brukerId);
  if (!access) {
    res.status(404).json({ ok: false, melding: 'Tur ikke funnet.' });
    return;
  }

  const tur = db.prepare('SELECT * FROM fjellturer WHERE id = ?').get(id);
  if (!tur.offentlig) {
    res.status(403).json({ ok: false, melding: 'Kommentarer er kun tillatt på offentlige turer.' });
    return;
  }

  const cleanInnhold = String(innhold ?? '').trim();
  if (!cleanInnhold) {
    res.json({ ok: false, melding: 'Kommentaren kan ikke være tom.' });
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
      SELECT id, parent_id
      FROM tur_kommentarer
      WHERE id = ? AND tur_id = ?
    `).get(parsedParentId, id);

    if (!parentComment) {
      res.json({ ok: false, melding: 'Kommentaren du svarer på finnes ikke.' });
      return;
    }

    if (parentComment.parent_id !== null) {
      res.json({ ok: false, melding: 'Du kan ikke svare på et svar.' });
      return;
    }
  }

  db.prepare(`
    INSERT INTO tur_kommentarer (tur_id, bruker_id, parent_id, innhold)
    VALUES (?, ?, ?, ?)
  `).run(id, brukerId, parsedParentId, cleanInnhold);

  res.json({
    ok: true,
    kommentarer: getCommentsForTrip(id)
  });
});

// --- User search ---
router.get('/api/brukere/sok', requireAuth, (req, res) => {
  const query = String(req.query.q ?? '').trim();
  if (query.length < 2) {
    res.json({ brukere: [] });
    return;
  }

  const brukere = db.prepare(`
    SELECT id, brukernavn
    FROM brukere
    WHERE brukernavn LIKE ? AND id != ?
    LIMIT 10
  `).all(`%${query}%`, req.session.bruker.id);

  res.json({ brukere });
});

// --- Participants ---
router.post('/api/turer/:id/deltakere', requireAuth, (req, res) => {
  const { id } = req.params;
  const { brukerId } = req.body;
  const tur = getTripForUser(id, req.session.bruker.id);

  if (!tur) {
    res.status(404).json({ ok: false, melding: 'Tur ikke funnet.' });
    return;
  }

  const parsedBrukerId = Number(brukerId);
  if (!Number.isInteger(parsedBrukerId) || parsedBrukerId < 1) {
    res.json({ ok: false, melding: 'Ugyldig bruker-id.' });
    return;
  }

  const bruker = db.prepare('SELECT id FROM brukere WHERE id = ?').get(parsedBrukerId);
  if (!bruker) {
    res.json({ ok: false, melding: 'Brukeren finnes ikke.' });
    return;
  }

  try {
    db.prepare(
      'INSERT INTO tur_deltakere (tur_id, bruker_id, lagt_til_av_id) VALUES (?, ?, ?)'
    ).run(id, parsedBrukerId, req.session.bruker.id);
  } catch (_) {
    res.json({ ok: false, melding: 'Brukeren er allerede lagt til.' });
    return;
  }

  res.json({ ok: true, deltakere: getParticipantsForTrip(id) });
});

router.delete('/api/turer/:id/deltakere/:brukerId', requireAuth, (req, res) => {
  const { id, brukerId } = req.params;
  const requesterId = req.session.bruker.id;
  const parsedBrukerId = Number(brukerId);
  const isSelf = parsedBrukerId === requesterId;

  if (isSelf) {
    const participation = db.prepare(
      'SELECT id FROM tur_deltakere WHERE tur_id = ? AND bruker_id = ?'
    ).get(id, requesterId);
    if (!participation) {
      res.status(404).json({ ok: false, melding: 'Du er ikke deltaker på denne turen.' });
      return;
    }
  } else {
    const tur = getTripForUser(id, requesterId);
    if (!tur) {
      res.status(404).json({ ok: false, melding: 'Tur ikke funnet.' });
      return;
    }
  }

  db.prepare('DELETE FROM tur_deltakere WHERE tur_id = ? AND bruker_id = ?').run(id, brukerId);

  res.json({ ok: true, deltakere: getParticipantsForTrip(id) });
});

module.exports = router;
