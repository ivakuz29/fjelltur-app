const Database = require('better-sqlite3');
const db = new Database('fjelltur.db');

// Lag tabeller hvis de ikke finnes
db.exec(`
  CREATE TABLE IF NOT EXISTS brukere (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brukernavn TEXT UNIQUE NOT NULL,
    passord TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fjellturer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fjell TEXT NOT NULL,
    dato TEXT NOT NULL,
    distanse REAL,
    notat TEXT,
    bruker_id INTEGER NOT NULL,
    FOREIGN KEY (bruker_id) REFERENCES brukere(id)
  );

  CREATE TABLE IF NOT EXISTS tur_bilder (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tur_id INTEGER NOT NULL,
    filnavn TEXT NOT NULL,
    FOREIGN KEY (tur_id) REFERENCES fjellturer(id)
  );

  CREATE TABLE IF NOT EXISTS tur_kommentarer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tur_id INTEGER NOT NULL,
    bruker_id INTEGER NOT NULL,
    parent_id INTEGER,
    innhold TEXT NOT NULL,
    opprettet TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tur_id) REFERENCES fjellturer(id),
    FOREIGN KEY (bruker_id) REFERENCES brukere(id),
    FOREIGN KEY (parent_id) REFERENCES tur_kommentarer(id)
  );

  CREATE TABLE IF NOT EXISTS tur_deltakere (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tur_id INTEGER NOT NULL,
    bruker_id INTEGER NOT NULL,
    lagt_til_av_id INTEGER NOT NULL,
    FOREIGN KEY (tur_id) REFERENCES fjellturer(id),
    FOREIGN KEY (bruker_id) REFERENCES brukere(id),
    FOREIGN KEY (lagt_til_av_id) REFERENCES brukere(id),
    UNIQUE(tur_id, bruker_id)
  );
`);

// Migrasjon: legg til hoyde-kolonne hvis den ikke finnes
try {
  db.exec('ALTER TABLE fjellturer ADD COLUMN hoyde INTEGER');
} catch (_) {}

// Migrasjon: legg til offentlig-kolonne hvis den ikke finnes
try {
  db.exec('ALTER TABLE fjellturer ADD COLUMN offentlig INTEGER NOT NULL DEFAULT 0');
} catch (_) {}

module.exports = db;
