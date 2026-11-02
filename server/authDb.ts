import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, '../student_attendance/data');
export const DATASETS_DIR = path.resolve(DATA_DIR, 'datasets');
export const AUTH_DB_PATH = path.resolve(DATA_DIR, 'auth.db');

if (!fs.existsSync(DATASETS_DIR)) {
  fs.mkdirSync(DATASETS_DIR, { recursive: true });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface AuthenticatedFaculty {
  id: number;
  email: string;
  faculty_name: string;
  department: string;
  active_dataset: string;
  tokenHash: string;
}

declare global {
  namespace Express {
    interface Request {
      faculty?: AuthenticatedFaculty;
    }
  }
}

export function sanitizeDatasetName(name: string): string {
  const clean = String(name || '').trim().replace(/[^a-zA-Z0-9 _\-()]/g, '').trim();
  return clean || 'Class 1';
}

function buildPhysicalDbFilename(facultyId: number, datasetName: string): string {
  const safeSlug = sanitizeDatasetName(datasetName).replace(/\s+/g, '_');
  return `faculty_${facultyId}__${safeSlug}.db`;
}

// Cryptographic password hashing using scrypt + random 16-byte salt (never plain-text)
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$')) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, keyHex] = parts;
  if (!salt || !keyHex) return false;

  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (storedBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function openAuthDb(): Database.Database {
  const db = new Database(AUTH_DB_PATH);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS faculty_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      faculty_name TEXT NOT NULL,
      department TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active_dataset TEXT NOT NULL DEFAULT 'Class 1',
      is_legacy_migrated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS faculty_sessions (
      token_hash TEXT PRIMARY KEY,
      faculty_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(faculty_id) REFERENCES faculty_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS faculty_datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER NOT NULL,
      dataset_name TEXT NOT NULL,
      db_filename TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(faculty_id, dataset_name),
      FOREIGN KEY(faculty_id) REFERENCES faculty_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_faculty_sessions_faculty ON faculty_sessions(faculty_id);
    CREATE INDEX IF NOT EXISTS idx_faculty_datasets_faculty ON faculty_datasets(faculty_id);
  `);
  return db;
}

const TABLES_WITH_FACULTY_ID = [
  'faculty_profile',
  'students',
  'subjects',
  'timetable',
  'attendance_sessions',
  'attendance_records',
  'daily_attendance',
  'period_attendance',
  'holidays'
] as const;

export function ensureDatasetSchemaAndOwnership(
  db: Database.Database,
  facultyId: number,
  backfillNullRows = true
): void {
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS faculty_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER,
      faculty_name TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      academic_year TEXT NOT NULL DEFAULT '',
      year_of_study TEXT NOT NULL DEFAULT '',
      semester TEXT NOT NULL DEFAULT '',
      class_section TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER,
      reg_no TEXT NOT NULL UNIQUE,
      roll_no TEXT,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER,
      name TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      semester_hours REAL NOT NULL DEFAULT 45,
      weekly_target INTEGER NOT NULL DEFAULT 3,
      period_duration_mins INTEGER NOT NULL DEFAULT 60,
      semester TEXT NOT NULL DEFAULT 'Semester 5',
      class_section TEXT NOT NULL DEFAULT 'Class 1',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS timetable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER,
      subject_id INTEGER NOT NULL,
      weekday INTEGER NOT NULL,
      period_no INTEGER NOT NULL,
      class_name TEXT NOT NULL DEFAULT 'Class 1',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(class_name, weekday, period_no),
      FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      session_id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER,
      class_id TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      period_number INTEGER NOT NULL,
      period_duration INTEGER NOT NULL DEFAULT 60,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(class_id, subject_id, attendance_date, period_number)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      record_id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER,
      session_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('P', 'A', 'OD', 'L')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, student_id),
      FOREIGN KEY(session_id) REFERENCES attendance_sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER,
      student_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('P', 'A')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, attendance_date),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS period_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER,
      student_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      period_no INTEGER NOT NULL DEFAULT 1,
      subject_id INTEGER,
      status TEXT NOT NULL CHECK (status IN ('P', 'A')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, attendance_date, period_no),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id INTEGER,
      holiday_date TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Safe non-destructive migration: add faculty_id column if absent on existing tables
  for (const table of TABLES_WITH_FACULTY_ID) {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
    const hasFacultyCol = cols.some(c => c.name === 'faculty_id');
    if (!hasFacultyCol) {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN faculty_id INTEGER`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS "idx_${table}_faculty_id" ON "${table}"(faculty_id)`);
    if (backfillNullRows) {
      db.prepare(`UPDATE "${table}" SET faculty_id = ? WHERE faculty_id IS NULL`).run(facultyId);
    }
  }
}

// Safely migrate genuine existing Class 1.db records without destructive resets or hardcoded shared credentials
export function runSafeStartupMigrations(): void {
  const authDb = openAuthDb();
  try {
    // Clean up expired sessions
    authDb.prepare('DELETE FROM faculty_sessions WHERE expires_at <= ?').run(new Date().toISOString());

    const legacyDbFile = 'Class 1.db';
    const legacyDbPath = path.join(DATASETS_DIR, legacyDbFile);
    if (fs.existsSync(legacyDbPath)) {
      const existingMapping = authDb
        .prepare('SELECT id, faculty_id FROM faculty_datasets WHERE db_filename = ?')
        .get(legacyDbFile) as { id: number; faculty_id: number } | undefined;

      if (!existingMapping) {
        const legacyDb = new Database(legacyDbPath);
        try {
          const hasStudentsTable = legacyDb
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='students'")
            .get();
          const studentCount = hasStudentsTable
            ? ((legacyDb.prepare('SELECT COUNT(*) as c FROM students').get() as any)?.c || 0)
            : 0;

          if (studentCount > 0) {
            const facName =
              (legacyDb.prepare("SELECT value FROM settings WHERE key='course_faculty_name'").get() as any)?.value?.trim() ||
              'Migrated Faculty';
            const deptName =
              (legacyDb.prepare("SELECT value FROM settings WHERE key='course_class_handled'").get() as any)?.value?.trim() ||
              'Academic Department';

            let legacyUser = authDb
              .prepare('SELECT id FROM faculty_users WHERE is_legacy_migrated = 1 LIMIT 1')
              .get() as { id: number } | undefined;

            if (!legacyUser) {
              // Store a cryptographically random unguessable hash (no hardcoded shared password)
              const lockedSecret = hashPassword(crypto.randomBytes(32).toString('hex'));
              const info = authDb
                .prepare(`
                  INSERT INTO faculty_users (email, faculty_name, department, password_hash, active_dataset, is_legacy_migrated)
                  VALUES (?, ?, ?, ?, 'Class 1', 1)
                `)
                .run('migrated.record@facultylog.internal', facName, deptName, lockedSecret);
              legacyUser = { id: Number(info.lastInsertRowid) };
            }

            authDb
              .prepare(`
                INSERT OR IGNORE INTO faculty_datasets (faculty_id, dataset_name, db_filename)
                VALUES (?, 'Class 1', ?)
              `)
              .run(legacyUser.id, legacyDbFile);

            ensureDatasetSchemaAndOwnership(legacyDb, legacyUser.id, true);
          }
        } finally {
          legacyDb.close();
        }
      }
    }
  } finally {
    authDb.close();
  }
}

export function initializeEmptyFacultyDataset(
  facultyId: number,
  facultyName: string,
  department: string,
  datasetName = 'Class 1',
  options?: { courseType?: string; subject?: string; totalHours?: number }
): { datasetName: string; dbFilename: string } {
  const cleanName = sanitizeDatasetName(datasetName);
  const authDb = openAuthDb();
  try {
    const existing = authDb
      .prepare('SELECT dataset_name, db_filename FROM faculty_datasets WHERE faculty_id = ? AND dataset_name = ?')
      .get(facultyId, cleanName) as { dataset_name: string; db_filename: string } | undefined;
    if (existing) {
      throw new HttpError(400, `Class dataset '${cleanName}' already exists in your account.`);
    }

    let dbFilename = buildPhysicalDbFilename(facultyId, cleanName);
    let suffix = 1;
    while (fs.existsSync(path.join(DATASETS_DIR, dbFilename))) {
      dbFilename = `faculty_${facultyId}__${cleanName.replace(/\s+/g, '_')}_${suffix++}.db`;
    }

    const dbPath = path.join(DATASETS_DIR, dbFilename);
    const db = new Database(dbPath);
    try {
      ensureDatasetSchemaAndOwnership(db, facultyId, true);

      // Initialize faculty profile & settings for this faculty WITHOUT any sample students
      db.prepare('DELETE FROM faculty_profile WHERE faculty_id = ?').run(facultyId);
      db.prepare(`
        INSERT INTO faculty_profile (faculty_id, faculty_name, department, academic_year, year_of_study, semester, class_section, updated_at)
        VALUES (?, ?, ?, '2026-2027', '4th Year', 'Semester 7', ?, CURRENT_TIMESTAMP)
      `).run(facultyId, facultyName.trim(), department.trim(), cleanName);

      const setStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      setStmt.run('low_attendance_threshold', '75');
      setStmt.run('course_type', options?.courseType === 'lab' ? 'lab' : 'classroom');
      setStmt.run('course_faculty_name', facultyName.trim());
      setStmt.run('course_class_handled', department.trim());
      setStmt.run('course_total_hours', String(options?.totalHours || 45));
      setStmt.run('course_subject', options?.subject?.trim() || '');

      if (options?.subject?.trim()) {
        const sName = options.subject.trim();
        db.prepare(`
          INSERT INTO subjects (faculty_id, name, code, semester_hours, weekly_target, period_duration_mins, semester, class_section)
          VALUES (?, ?, ?, ?, 3, 60, 'Semester 7', ?)
        `).run(facultyId, sName, sName.slice(0, 6).toUpperCase(), options.totalHours || 45, cleanName);
      }
    } finally {
      db.close();
    }

    authDb
      .prepare('INSERT INTO faculty_datasets (faculty_id, dataset_name, db_filename) VALUES (?, ?, ?)')
      .run(facultyId, cleanName, dbFilename);
    authDb
      .prepare('UPDATE faculty_users SET active_dataset = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(cleanName, facultyId);

    return { datasetName: cleanName, dbFilename };
  } finally {
    authDb.close();
  }
}

export function listFacultyDatasets(facultyId: number): Array<{ datasetName: string; dbFilename: string }> {
  const authDb = openAuthDb();
  try {
    const rows = authDb
      .prepare('SELECT dataset_name, db_filename FROM faculty_datasets WHERE faculty_id = ? ORDER BY dataset_name COLLATE NOCASE ASC')
      .all(facultyId) as Array<{ dataset_name: string; db_filename: string }>;
    return rows.map(r => ({ datasetName: r.dataset_name, dbFilename: r.db_filename }));
  } finally {
    authDb.close();
  }
}

export function setActiveFacultyDataset(facultyId: number, datasetName: string): string {
  const clean = sanitizeDatasetName(datasetName);
  const authDb = openAuthDb();
  try {
    const row = authDb
      .prepare('SELECT dataset_name FROM faculty_datasets WHERE faculty_id = ? AND dataset_name = ?')
      .get(facultyId, clean) as { dataset_name: string } | undefined;
    if (!row) {
      throw new HttpError(404, `Class dataset '${clean}' does not exist in your faculty account.`);
    }
    authDb
      .prepare('UPDATE faculty_users SET active_dataset = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(row.dataset_name, facultyId);
    return row.dataset_name;
  } finally {
    authDb.close();
  }
}

export function deleteFacultyDataset(faculty: AuthenticatedFaculty, datasetName: string): string {
  const clean = sanitizeDatasetName(datasetName);
  const authDb = openAuthDb();
  try {
    const row = authDb
      .prepare('SELECT id, dataset_name, db_filename FROM faculty_datasets WHERE faculty_id = ? AND dataset_name = ?')
      .get(faculty.id, clean) as { id: number; dataset_name: string; db_filename: string } | undefined;
    if (!row) {
      throw new HttpError(404, `Class dataset '${clean}' does not exist in your faculty account.`);
    }

    authDb.prepare('DELETE FROM faculty_datasets WHERE id = ? AND faculty_id = ?').run(row.id, faculty.id);
    const dbPath = path.join(DATASETS_DIR, row.db_filename);
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    const remaining = authDb
      .prepare('SELECT dataset_name FROM faculty_datasets WHERE faculty_id = ? ORDER BY dataset_name COLLATE NOCASE ASC')
      .all(faculty.id) as Array<{ dataset_name: string }>;

    if (remaining.length > 0) {
      const nextActive = remaining.some(r => r.dataset_name === faculty.active_dataset)
        ? faculty.active_dataset
        : remaining[0].dataset_name;
      authDb
        .prepare('UPDATE faculty_users SET active_dataset = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(nextActive, faculty.id);
      return nextActive;
    }
  } finally {
    authDb.close();
  }

  // If faculty deleted their last dataset, recreate a clean empty Class 1 for them
  const created = initializeEmptyFacultyDataset(faculty.id, faculty.faculty_name, faculty.department, 'Class 1');
  return created.datasetName;
}

export function getFacultyDb(
  faculty: AuthenticatedFaculty,
  requestedDataset?: string
): { db: Database.Database; datasetName: string; dbFilename: string } {
  const authDb = openAuthDb();
  let mapping: { dataset_name: string; db_filename: string } | undefined;

  try {
    if (requestedDataset !== undefined && String(requestedDataset).trim() !== '') {
      const cleanReq = sanitizeDatasetName(requestedDataset);
      mapping = authDb
        .prepare('SELECT dataset_name, db_filename FROM faculty_datasets WHERE faculty_id = ? AND dataset_name = ?')
        .get(faculty.id, cleanReq) as { dataset_name: string; db_filename: string } | undefined;
      if (!mapping) {
        throw new HttpError(403, `Access denied: Dataset '${cleanReq}' does not belong to your faculty account.`);
      }
    } else {
      mapping = authDb
        .prepare('SELECT dataset_name, db_filename FROM faculty_datasets WHERE faculty_id = ? AND dataset_name = ?')
        .get(faculty.id, faculty.active_dataset) as { dataset_name: string; db_filename: string } | undefined;

      if (!mapping) {
        mapping = authDb
          .prepare('SELECT dataset_name, db_filename FROM faculty_datasets WHERE faculty_id = ? ORDER BY id ASC LIMIT 1')
          .get(faculty.id) as { dataset_name: string; db_filename: string } | undefined;
        if (mapping) {
          authDb
            .prepare('UPDATE faculty_users SET active_dataset = ? WHERE id = ?')
            .run(mapping.dataset_name, faculty.id);
          faculty.active_dataset = mapping.dataset_name;
        }
      }
    }
  } finally {
    authDb.close();
  }

  if (!mapping) {
    const created = initializeEmptyFacultyDataset(faculty.id, faculty.faculty_name, faculty.department, 'Class 1');
    mapping = { dataset_name: created.datasetName, db_filename: created.dbFilename };
    faculty.active_dataset = created.datasetName;
  }

  const dbPath = path.join(DATASETS_DIR, mapping.db_filename);
  const db = new Database(dbPath);
  ensureDatasetSchemaAndOwnership(db, faculty.id, true);
  return {
    db,
    datasetName: mapping.dataset_name,
    dbFilename: mapping.db_filename
  };
}

export function updateFacultyAccountIdentity(facultyId: number, facultyName: string, department: string): void {
  const cleanName = facultyName.trim();
  const cleanDept = department.trim();
  if (!cleanName || !cleanDept) return;
  const authDb = openAuthDb();
  try {
    authDb
      .prepare('UPDATE faculty_users SET faculty_name = ?, department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(cleanName, cleanDept, facultyId);
  } finally {
    authDb.close();
  }
}

export const SESSION_COOKIE_NAME = 'facultylog_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createFacultySession(facultyId: number): { rawToken: string; expiresAt: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const authDb = openAuthDb();
  try {
    authDb
      .prepare('INSERT INTO faculty_sessions (token_hash, faculty_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, facultyId, expiresAt);
  } finally {
    authDb.close();
  }

  return { rawToken, expiresAt };
}

export function setSessionCookie(req: express.Request, res: express.Response, rawToken: string): void {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    isSecure ? 'SameSite=None; Secure' : 'SameSite=Lax'
  ];
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

export function clearSessionCookie(req: express.Request, res: express.Response): void {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isSecure ? 'SameSite=None; Secure' : 'SameSite=Lax'
  ];
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

export function extractRawTokenFromRequest(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const rawCookie = req.headers.cookie;
  if (rawCookie) {
    const pairs = rawCookie.split(';');
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const key = pair.slice(0, eqIdx).trim();
      const val = pair.slice(eqIdx + 1).trim();
      if (key === SESSION_COOKIE_NAME && val) {
        try {
          return decodeURIComponent(val);
        } catch {
          return val;
        }
      }
    }
  }
  return null;
}

export function resolveSessionFaculty(req: express.Request): AuthenticatedFaculty | null {
  const rawToken = extractRawTokenFromRequest(req);
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const authDb = openAuthDb();
  try {
    const row = authDb
      .prepare(`
        SELECT s.token_hash, s.expires_at,
               u.id, u.email, u.faculty_name, u.department, u.active_dataset
        FROM faculty_sessions s
        JOIN faculty_users u ON u.id = s.faculty_id
        WHERE s.token_hash = ?
      `)
      .get(tokenHash) as
      | {
          token_hash: string;
          expires_at: string;
          id: number;
          email: string;
          faculty_name: string;
          department: string;
          active_dataset: string;
        }
      | undefined;

    if (!row) return null;

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      authDb.prepare('DELETE FROM faculty_sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      faculty_name: row.faculty_name,
      department: row.department,
      active_dataset: row.active_dataset,
      tokenHash: row.token_hash
    };
  } finally {
    authDb.close();
  }
}

export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const faculty = resolveSessionFaculty(req);
  if (!faculty) {
    res.status(401).json({ error: 'Authentication required. Please log in to access FacultyLog.' });
    return;
  }
  req.faculty = faculty;
  next();
}
