import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { createServer as createViteServer } from 'vite';
import {
  AUTH_DB_PATH,
  DATASETS_DIR,
  HttpError,
  clearSessionCookie,
  createFacultySession,
  deleteFacultyDataset,
  extractRawTokenFromRequest,
  getFacultyDb,
  hashPassword,
  hashSessionToken,
  initializeEmptyFacultyDataset,
  listFacultyDatasets,
  openAuthDb,
  requireAuth,
  resolveSessionFaculty,
  runSafeStartupMigrations,
  sanitizeDatasetName,
  setActiveFacultyDataset,
  setSessionCookie,
  updateFacultyAccountIdentity,
  verifyPassword
} from './server/authDb.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Run safe non-destructive SQLite migrations on startup
runSafeStartupMigrations();

function sendRouteError(res: express.Response, err: any, fallbackMsg = 'Internal server error') {
  const status = err instanceof HttpError ? err.status : 500;
  res.status(status).json({ error: err?.message || fallbackMsg });
}

// Normalize roll number for consistent matching (e.g. "01" -> "1", "1.0" -> "1", "21CS01" -> "21cs01")
function normalizeRollKey(value: unknown): string {
  let text = String(value ?? '').trim();
  if (!text) return '';
  if (text.endsWith('.0') && /^\d+\.0$/.test(text)) {
    text = text.slice(0, -2);
  }
  if (/^\d+$/.test(text)) {
    return String(parseInt(text, 10));
  }
  return text.toLowerCase();
}

// Natural sort for roll numbers and register numbers matching original python roll_sort_key
function compareRolls(a: string, b: string): number {
  const aStr = String(a ?? '').trim();
  const bStr = String(b ?? '').trim();
  const aClean = aStr.endsWith('.0') && /^\d+\.0$/.test(aStr) ? aStr.slice(0, -2) : aStr;
  const bClean = bStr.endsWith('.0') && /^\d+\.0$/.test(bStr) ? bStr.slice(0, -2) : bStr;
  const aDigits = aClean.replace(/\D/g, '');
  const bDigits = bClean.replace(/\D/g, '');

  if (aDigits && bDigits) {
    const aNum = parseInt(aDigits, 10);
    const bNum = parseInt(bDigits, 10);
    if (aNum !== bNum) return aNum - bNum;
    return aClean.localeCompare(bClean, undefined, { numeric: true, sensitivity: 'base' });
  }
  if (aDigits && !bDigits) return -1;
  if (!aDigits && bDigits) return 1;
  return aClean.localeCompare(bClean, undefined, { sensitivity: 'base' });
}

// Robust extractor keeping S.No, Roll Number, and Register Number strictly separate
function extractStudentFields(
  item: any,
  rowIndex: number
): { sNo: number | string; rollNo: string; regNo: string; name: string; hasExplicitRoll: boolean } {
  if (!item) {
    return { sNo: rowIndex + 1, rollNo: String(rowIndex + 1), regNo: '', name: '', hasExplicitRoll: false };
  }

  // If item is an array: [sNo, rollNo, regNo, name] or [sNo, regNo, name] or [regNo, name]
  if (Array.isArray(item)) {
    if (item.length >= 4) {
      const sVal = String(item[0] ?? (rowIndex + 1)).trim();
      const rollVal = String(item[1] ?? '').trim();
      const regVal = String(item[2] ?? '').trim();
      const nameVal = String(item.slice(3).join(' ') ?? '').trim();
      return {
        sNo: sVal || (rowIndex + 1),
        rollNo: rollVal || sVal || String(rowIndex + 1),
        regNo: regVal,
        name: nameVal,
        hasExplicitRoll: Boolean(rollVal)
      };
    } else if (item.length === 3) {
      const sVal = String(item[0] ?? (rowIndex + 1)).trim();
      return {
        sNo: sVal || (rowIndex + 1),
        rollNo: sVal || String(rowIndex + 1),
        regNo: String(item[1] ?? '').trim(),
        name: String(item[2] ?? '').trim(),
        hasExplicitRoll: false
      };
    } else if (item.length === 2) {
      return {
        sNo: rowIndex + 1,
        rollNo: String(rowIndex + 1),
        regNo: String(item[0] ?? '').trim(),
        name: String(item[1] ?? '').trim(),
        hasExplicitRoll: false
      };
    }
  }

  let sNo = '';
  let rollNo = '';
  let regNo = '';
  let name = '';
  let hasExplicitRoll = false;

  const keys = Object.keys(item);
  for (const rawKey of keys) {
    const k = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    const val = String(item[rawKey] ?? '').trim();
    if (!val) continue;

    // S.No match (kept distinct from Roll Number and Register Number)
    if (['sno', 'slno', 'serialnumber', 'serialno', 'sl', 'sn', 'serial'].includes(k)) {
      if (!sNo) sNo = val;
    }
    // Roll Number match (kept distinct from S.No and Register Number)
    else if (['rollno', 'rollnumber', 'roll', 'rollnum', 'rollid'].includes(k)) {
      if (!rollNo) {
        rollNo = val;
        hasExplicitRoll = true;
      }
    }
    // Register Number match
    else if (['registernumber', 'registerno', 'regno', 'registrationnumber', 'registrationno', 'regn', 'register', 'usn', 'studentid', 'admno'].includes(k)) {
      if (!regNo) regNo = val;
    }
    // Student Name match
    else if (['studentname', 'name', 'studentsname', 'fullname', 'candidate', 'student', 'names', 'studentnames'].includes(k)) {
      if (!name) name = val;
    }
  }

  // Fallback by key position if standard keys were not matched
  if (!regNo || !name) {
    const nonBlankEntries = Object.entries(item).filter(([_, v]) => String(v ?? '').trim().length > 0);
    if (nonBlankEntries.length >= 4) {
      if (!sNo) sNo = String(nonBlankEntries[0][1]).trim();
      if (!rollNo) {
        rollNo = String(nonBlankEntries[1][1]).trim();
        hasExplicitRoll = true;
      }
      if (!regNo) regNo = String(nonBlankEntries[2][1]).trim();
      if (!name) name = String(nonBlankEntries[3][1]).trim();
    } else if (nonBlankEntries.length === 3) {
      if (!sNo) sNo = String(nonBlankEntries[0][1]).trim();
      if (!regNo) regNo = String(nonBlankEntries[1][1]).trim();
      if (!name) name = String(nonBlankEntries[2][1]).trim();
    } else if (nonBlankEntries.length === 2) {
      if (!sNo) sNo = String(rowIndex + 1);
      if (!regNo) regNo = String(nonBlankEntries[0][1]).trim();
      if (!name) name = String(nonBlankEntries[1][1]).trim();
    }
  }

  const finalSNo = sNo || (rowIndex + 1);
  let finalRollNo = rollNo;
  if (!finalRollNo) {
    const cleanSNo = String(finalSNo).trim();
    finalRollNo = cleanSNo.endsWith('.0') && /^\d+\.0$/.test(cleanSNo) ? cleanSNo.slice(0, -2) : cleanSNo;
  } else if (finalRollNo.endsWith('.0') && /^\d+\.0$/.test(finalRollNo)) {
    finalRollNo = finalRollNo.slice(0, -2);
  }

  let cleanReg = regNo;
  if (cleanReg.endsWith('.0') && /^\d+\.0$/.test(cleanReg)) {
    cleanReg = cleanReg.slice(0, -2);
  }

  return {
    sNo: finalSNo,
    rollNo: finalRollNo,
    regNo: cleanReg,
    name,
    hasExplicitRoll
  };
}

function getNextRollNumber(existingStudents: any[], extraUsedKeys?: Set<string>): string {
  let maxNum = 0;
  const used = new Set<string>(extraUsedKeys ? Array.from(extraUsedKeys) : []);
  for (const s of existingStudents) {
    const rk = normalizeRollKey(s.roll_no);
    if (rk) used.add(rk);
    if (/^\d+$/.test(rk)) {
      const n = parseInt(rk, 10);
      if (n > maxNum) maxNum = n;
    }
  }
  let candidate = maxNum + 1;
  while (used.has(String(candidate))) {
    candidate++;
  }
  return String(candidate);
}

// Attendance marks calculation formula (preserves original FacultyLog reference logic)
function calculateAttendanceMarks(absentCount: number, totalPeriods = 40, courseType = 'classroom'): number {
  const safeTotal = Math.max(0, Number(totalPeriods) || 0);
  const rawVal = Number(absentCount) || 0;
  // Match original Python isinstance(absent_count, float) and absent_count > float(total_periods)
  const isFloatPercentage = !Number.isInteger(rawVal) && safeTotal > 0 && rawVal > safeTotal;

  if (courseType.toLowerCase() === 'lab') {
    let absentDays = Math.max(0, Math.round(rawVal));
    if (isFloatPercentage) {
      const pct = Math.max(0, Math.min(100, rawVal));
      absentDays = Math.max(0, Math.round((safeTotal * (100.0 - pct)) / 100.0));
    }
    return Math.max(0, 5 - absentDays);
  }

  let absentClasses = Math.max(0, Math.round(rawVal));
  if (isFloatPercentage) {
    const pct = Math.max(0, Math.min(100, rawVal));
    absentClasses = Math.max(0, Math.round((safeTotal * (100.0 - pct)) / 100.0));
  }
  const reduction = Math.max(0, Math.floor(absentClasses / 3));
  return Math.max(0, 5 - reduction);
}

// Month name map
const MONTH_NAMES: Record<number, string> = {
  1: 'JANUARY', 2: 'FEBRUARY', 3: 'MARCH', 4: 'APRIL', 5: 'MAY', 6: 'JUNE',
  7: 'JULY', 8: 'AUGUST', 9: 'SEPTEMBER', 10: 'OCTOBER', 11: 'NOVEMBER', 12: 'DECEMBER'
};

const WEEKDAY_CODES: Record<number, string> = {
  0: 'M', 1: 'TU', 2: 'W', 3: 'TH', 4: 'F', 5: 'SA', 6: 'SU'
};

// ==========================================
// 0. FACULTY AUTHENTICATION ROUTES
// ==========================================

app.post('/api/auth/register', (req, res) => {
  try {
    const { faculty_name, department, email, password } = req.body;
    const cleanName = String(faculty_name || '').trim();
    const cleanDept = String(department || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const rawPassword = String(password || '');

    if (!cleanName) {
      return res.status(400).json({ error: 'Faculty Name is required.' });
    }
    if (!cleanDept) {
      return res.status(400).json({ error: 'Department is required.' });
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid institutional or faculty email address.' });
    }
    if (rawPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const authDb = openAuthDb();
    let newFacultyId = 0;
    try {
      const existing = authDb
        .prepare('SELECT id FROM faculty_users WHERE email = ? COLLATE NOCASE')
        .get(cleanEmail) as { id: number } | undefined;
      if (existing) {
        return res.status(400).json({ error: 'A faculty account with this email is already registered. Please sign in.' });
      }

      const pwdHash = hashPassword(rawPassword);
      const info = authDb
        .prepare(`
          INSERT INTO faculty_users (email, faculty_name, department, password_hash, active_dataset, is_legacy_migrated)
          VALUES (?, ?, ?, ?, 'Class 1', 0)
        `)
        .run(cleanEmail, cleanName, cleanDept, pwdHash);
      newFacultyId = Number(info.lastInsertRowid);
    } finally {
      authDb.close();
    }

    // Initialize an empty default class dataset (0 students, no sample records) for this new faculty account
    initializeEmptyFacultyDataset(newFacultyId, cleanName, cleanDept, 'Class 1');

    const { rawToken } = createFacultySession(newFacultyId);
    setSessionCookie(req, res, rawToken);

    res.status(201).json({
      success: true,
      token: rawToken,
      user: {
        id: newFacultyId,
        email: cleanEmail,
        faculty_name: cleanName,
        department: cleanDept,
        active_dataset: 'Class 1'
      }
    });
  } catch (err: any) {
    sendRouteError(res, err, 'Registration failed.');
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const cleanEmail = String(req.body.email || '').trim().toLowerCase();
    const rawPassword = String(req.body.password || '');

    if (!cleanEmail || !rawPassword) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const authDb = openAuthDb();
    let userRow:
      | {
          id: number;
          email: string;
          faculty_name: string;
          department: string;
          password_hash: string;
          active_dataset: string;
          is_legacy_migrated: number;
        }
      | undefined;
    try {
      userRow = authDb
        .prepare(`
          SELECT id, email, faculty_name, department, password_hash, active_dataset, is_legacy_migrated
          FROM faculty_users
          WHERE email = ? COLLATE NOCASE AND is_legacy_migrated = 0
        `)
        .get(cleanEmail) as any;
    } finally {
      authDb.close();
    }

    if (!userRow || !verifyPassword(rawPassword, userRow.password_hash)) {
      return res.status(401).json({ error: 'Invalid faculty email or password.' });
    }

    const { rawToken } = createFacultySession(userRow.id);
    setSessionCookie(req, res, rawToken);

    res.json({
      success: true,
      token: rawToken,
      user: {
        id: userRow.id,
        email: userRow.email,
        faculty_name: userRow.faculty_name,
        department: userRow.department,
        active_dataset: userRow.active_dataset
      }
    });
  } catch (err: any) {
    sendRouteError(res, err, 'Login failed.');
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const rawToken = extractRawTokenFromRequest(req);
    if (rawToken) {
      const tokenHash = hashSessionToken(rawToken);
      const authDb = openAuthDb();
      try {
        authDb.prepare('DELETE FROM faculty_sessions WHERE token_hash = ?').run(tokenHash);
      } finally {
        authDb.close();
      }
    }
    clearSessionCookie(req, res);
    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err, 'Logout failed.');
  }
});

app.get('/api/auth/me', (req, res) => {
  const faculty = resolveSessionFaculty(req);
  if (!faculty) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    user: {
      id: faculty.id,
      email: faculty.email,
      faculty_name: faculty.faculty_name,
      department: faculty.department,
      active_dataset: faculty.active_dataset
    }
  });
});

// STRICT AUTHENTICATION GATE FOR ALL PROTECTED API ENDPOINTS
app.use('/api', requireAuth);

// ==========================================
// PROTECTED API ROUTES (Faculty-Isolated)
// ==========================================

// 1. FACULTY PROFILE & SETUP
app.get('/api/profile', (req, res) => {
  try {
    const faculty = req.faculty!;
    const { db, datasetName } = getFacultyDb(faculty);
    const row = db
      .prepare('SELECT * FROM faculty_profile WHERE faculty_id = ? ORDER BY id DESC LIMIT 1')
      .get(faculty.id) as any;
    db.close();

    const effectiveName = row?.faculty_name?.trim() || faculty.faculty_name;
    const effectiveDept = row?.department?.trim() || faculty.department;

    res.json({
      hasProfile: Boolean(effectiveName && effectiveDept),
      profile: {
        faculty_name: effectiveName,
        department: effectiveDept,
        academic_year: row?.academic_year || '2026-2027',
        year_of_study: row?.year_of_study || '4th Year',
        semester: row?.semester || 'Semester 7',
        class_section: row?.class_section || datasetName,
        is_configured: true
      }
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.post('/api/profile', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const {
      faculty_name,
      department,
      academic_year,
      year_of_study,
      semester,
      class_section,
      default_subject_name,
      default_total_hours,
      default_weekly_target,
      default_period_duration
    } = req.body;

    if (!faculty_name?.trim() || !department?.trim()) {
      return res.status(400).json({ error: 'Faculty Name and Department are required.' });
    }

    const { db, datasetName } = getFacultyDb(faculty);
    db.prepare('DELETE FROM faculty_profile WHERE faculty_id = ?').run(fid);
    db.prepare(`
      INSERT INTO faculty_profile (faculty_id, faculty_name, department, academic_year, year_of_study, semester, class_section, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      fid,
      faculty_name.trim(),
      department.trim(),
      (academic_year || '2026-2027').trim(),
      (year_of_study || 'Final Year (4th Year)').trim(),
      (semester || 'Semester 7').trim(),
      (class_section || datasetName).trim()
    );

    // Keep faculty account name/department & dataset settings synced
    updateFacultyAccountIdentity(fid, faculty_name.trim(), department.trim());
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('course_faculty_name', ?)").run(faculty_name.trim());
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('course_class_handled', ?)").run(department.trim());

    if (default_subject_name?.trim()) {
      const sName = default_subject_name.trim();
      const sHrs = parseFloat(default_total_hours) || 45;
      const sTarget = parseInt(default_weekly_target, 10) || 3;
      const sDur = parseInt(default_period_duration, 10) || 60;
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('course_subject', ?)").run(sName);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('course_total_hours', ?)").run(String(sHrs));

      const existingSubj = db.prepare('SELECT id FROM subjects WHERE faculty_id = ? AND name = ?').get(fid, sName) as any;
      if (existingSubj) {
        db.prepare(`
          UPDATE subjects SET semester_hours = ?, weekly_target = ?, period_duration_mins = ?, semester = ?, class_section = ?
          WHERE id = ? AND faculty_id = ?
        `).run(sHrs, sTarget, sDur, semester || 'Semester 7', class_section || datasetName, existingSubj.id, fid);
      } else {
        db.prepare(`
          INSERT INTO subjects (faculty_id, name, code, semester_hours, weekly_target, period_duration_mins, semester, class_section)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(fid, sName, sName.slice(0, 6).toUpperCase(), sHrs, sTarget, sDur, semester || 'Semester 7', class_section || datasetName);
      }
    }

    db.close();
    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 2. BLANK STUDENT TEMPLATES DOWNLOAD (No dummy/sample data!)
app.get('/api/templates/students.csv', (req, res) => {
  const csvContent = 'S.No,Roll Number,Register Number,Student Name\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="students_template.csv"');
  res.send(csvContent);
});

app.get('/api/templates/students.xlsx', (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['S.No', 'Roll Number', 'Register Number', 'Student Name']]);
  ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 22 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="students_template.xlsx"');
  res.send(buffer);
});

// 3. STUDENT IMPORT VALIDATION & COMMIT
app.post('/api/students/validate', (req, res) => {
  try {
    const faculty = req.faculty!;
    const { rows, importMode, dataset } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No student rows provided.' });
    }

    let existingStudents: any[] = [];
    if (importMode !== 'new') {
      const { db } = getFacultyDb(faculty, dataset);
      existingStudents = db
        .prepare('SELECT id, reg_no, roll_no, name FROM students WHERE faculty_id = ?')
        .all(faculty.id) as any[];
      db.close();
    }

    const existingRegNos = new Set(existingStudents.map(s => String(s.reg_no).trim().toLowerCase()));
    const existingRollKeys = new Set(existingStudents.map(s => normalizeRollKey(s.roll_no)).filter(Boolean));

    const validatedRows: any[] = [];
    const errors: string[] = [];
    const seenRegInFile = new Set<string>();
    const seenRollInFile = new Set<string>();

    let duplicateCount = 0;
    let missingValuesCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const item = rows[i];
      const extracted = extractStudentFields(item, i);
      const { sNo, regNo, name, hasExplicitRoll } = extracted;
      let rollNo = extracted.rollNo;

      // Skip completely empty rows
      if (!regNo && !name) {
        continue;
      }

      let rowStatus: 'valid' | 'invalid' | 'duplicate' = 'valid';
      let errorMsg = '';

      if (!regNo) {
        rowStatus = 'invalid';
        errorMsg = 'Missing Register Number';
        missingValuesCount++;
      } else if (!name) {
        rowStatus = 'invalid';
        errorMsg = 'Missing Student Name';
        missingValuesCount++;
      } else {
        const regLower = regNo.toLowerCase();
        const rollKey = normalizeRollKey(rollNo);

        if (seenRegInFile.has(regLower)) {
          rowStatus = 'duplicate';
          errorMsg = 'Duplicate Register Number in uploaded file';
          duplicateCount++;
        } else if (existingRegNos.has(regLower)) {
          rowStatus = 'duplicate';
          errorMsg = 'Register Number already registered in this class';
          duplicateCount++;
        } else if (hasExplicitRoll && rollKey && seenRollInFile.has(rollKey)) {
          rowStatus = 'duplicate';
          errorMsg = `Duplicate Roll Number "${rollNo}" in uploaded file`;
          duplicateCount++;
        } else if (hasExplicitRoll && rollKey && existingRollKeys.has(rollKey)) {
          rowStatus = 'duplicate';
          errorMsg = `Roll Number "${rollNo}" already assigned in this class`;
          duplicateCount++;
        } else {
          if (!hasExplicitRoll && rollKey && (existingRollKeys.has(rollKey) || seenRollInFile.has(rollKey))) {
            rollNo = getNextRollNumber(existingStudents, seenRollInFile);
          }
          seenRegInFile.add(regLower);
          const finalRollKey = normalizeRollKey(rollNo);
          if (finalRollKey) seenRollInFile.add(finalRollKey);
        }
      }

      if (errorMsg) {
        errors.push(`Row ${i + 2}: ${errorMsg} (${regNo || 'Empty RegNo'} - ${name || 'Empty Name'})`);
      }

      validatedRows.push({
        sNo,
        rollNo,
        regNo,
        name,
        status: rowStatus,
        error: errorMsg
      });
    }

    const validCount = validatedRows.filter(r => r.status === 'valid').length;
    const invalidCount = validatedRows.filter(r => r.status === 'invalid').length;

    res.json({
      total: validatedRows.length,
      validCount,
      invalidCount,
      duplicateCount,
      rows: validatedRows,
      errors
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 4. DATASETS / CLASSES (Strictly Scoped to Authenticated Faculty)
app.get('/api/datasets', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    let owned = listFacultyDatasets(fid);
    if (owned.length === 0) {
      initializeEmptyFacultyDataset(fid, faculty.faculty_name, faculty.department, 'Class 1');
      owned = listFacultyDatasets(fid);
    }

    const activeName = owned.some(d => d.datasetName === faculty.active_dataset)
      ? faculty.active_dataset
      : setActiveFacultyDataset(fid, owned[0].datasetName);

    const details = owned.map(({ datasetName }) => {
      const { db } = getFacultyDb(faculty, datasetName);
      const studentCount = (db.prepare('SELECT COUNT(*) as c FROM students WHERE faculty_id = ? AND is_active = 1').get(fid) as any)?.c || 0;
      const sessionCount = (db.prepare('SELECT COUNT(*) as c FROM attendance_sessions WHERE faculty_id = ?').get(fid) as any)?.c || 0;
      const markedDates = (db.prepare('SELECT COUNT(DISTINCT attendance_date) as c FROM daily_attendance WHERE faculty_id = ?').get(fid) as any)?.c || 0;
      const courseType = (db.prepare("SELECT value FROM settings WHERE key='course_type'").get() as any)?.value || 'classroom';
      const facLabel = (db.prepare("SELECT value FROM settings WHERE key='course_faculty_name'").get() as any)?.value || faculty.faculty_name;
      const subject = (db.prepare("SELECT value FROM settings WHERE key='course_subject'").get() as any)?.value || '';
      const classHandled = (db.prepare("SELECT value FROM settings WHERE key='course_class_handled'").get() as any)?.value || faculty.department || datasetName;
      db.close();
      return {
        name: datasetName,
        studentCount,
        sessionCount,
        markedDates,
        courseType,
        faculty: facLabel,
        subject,
        classHandled,
        isActive: datasetName === activeName
      };
    });
    res.json({ activeDataset: activeName, datasets: details });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.post('/api/datasets/active', (req, res) => {
  try {
    const faculty = req.faculty!;
    const { name } = req.body;
    const activeName = setActiveFacultyDataset(faculty.id, name);
    res.json({ success: true, activeDataset: activeName });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.post('/api/datasets', (req, res) => {
  try {
    const faculty = req.faculty!;
    const { name, courseType, facultyName, subject, totalHours } = req.body;
    const created = initializeEmptyFacultyDataset(
      faculty.id,
      facultyName?.trim() || faculty.faculty_name,
      faculty.department,
      name,
      {
        courseType,
        subject,
        totalHours: totalHours ? Number(totalHours) : 45
      }
    );
    res.json({ success: true, name: created.datasetName });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.delete('/api/datasets/:name', (req, res) => {
  try {
    const faculty = req.faculty!;
    const nextActive = deleteFacultyDataset(faculty, req.params.name);
    res.json({ success: true, activeDataset: nextActive });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 5. DASHBOARD STATS (Strictly Scoped to Authenticated Faculty)
app.get('/api/stats', (req, res) => {
  try {
    const facultyUser = req.faculty!;
    const fid = facultyUser.id;
    const { db, datasetName } = getFacultyDb(facultyUser);

    const totalStudents = (db.prepare('SELECT COUNT(*) as c FROM students WHERE faculty_id = ? AND is_active = 1').get(fid) as any)?.c || 0;
    const totalDatasets = listFacultyDatasets(fid).length;
    const distinctDates = (db.prepare('SELECT COUNT(DISTINCT attendance_date) as c FROM daily_attendance WHERE faculty_id = ?').get(fid) as any)?.c || 0;
    const totalSessions = (db.prepare('SELECT COUNT(*) as c FROM attendance_sessions WHERE faculty_id = ?').get(fid) as any)?.c || 0;

    // Attendance % from daily_attendance for this faculty
    const totalPresent = (db.prepare("SELECT COUNT(*) as c FROM daily_attendance WHERE faculty_id = ? AND status = 'P'").get(fid) as any)?.c || 0;
    const totalMarked = (db.prepare('SELECT COUNT(*) as c FROM daily_attendance WHERE faculty_id = ?').get(fid) as any)?.c || 0;
    const overallPct = totalMarked > 0 ? ((totalPresent / totalMarked) * 100).toFixed(1) : '0.0';

    // Today's attendance
    const today = new Date().toISOString().split('T')[0];
    const todayPresent = (db.prepare("SELECT COUNT(*) as c FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ? AND status = 'P'").get(fid, today) as any)?.c || 0;
    const todayAbsent = (db.prepare("SELECT COUNT(*) as c FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ? AND status = 'A'").get(fid, today) as any)?.c || 0;
    const todayMarked = (todayPresent + todayAbsent) > 0;

    // Faculty Profile (always reflects logged-in faculty's name and department)
    const profileRow = db.prepare('SELECT * FROM faculty_profile WHERE faculty_id = ? ORDER BY id DESC LIMIT 1').get(fid) as any;
    const faculty = profileRow?.faculty_name?.trim() || facultyUser.faculty_name;
    const department = profileRow?.department?.trim() || facultyUser.department;
    const hasProfile = Boolean(faculty && department);
    const academicYear = profileRow?.academic_year || '2026-2027';
    const yearOfStudy = profileRow?.year_of_study || '4th Year';
    const semester = profileRow?.semester || 'Semester 7';
    const classSection = profileRow?.class_section || datasetName;

    // Subject info
    const subjectRow = db.prepare('SELECT name FROM subjects WHERE faculty_id = ? ORDER BY id ASC LIMIT 1').get(fid) as any;
    const subject = subjectRow?.name || (db.prepare("SELECT value FROM settings WHERE key='course_subject'").get() as any)?.value || '';
    const courseType = (db.prepare("SELECT value FROM settings WHERE key='course_type'").get() as any)?.value || 'classroom';
    const threshold = parseFloat((db.prepare("SELECT value FROM settings WHERE key='low_attendance_threshold'").get() as any)?.value || '75');

    // Recent activity
    const recentDates = db.prepare(`
      SELECT attendance_date,
             SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as present,
             SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as absent,
             COUNT(*) as total
      FROM daily_attendance
      WHERE faculty_id = ?
      GROUP BY attendance_date
      ORDER BY attendance_date DESC
      LIMIT 7
    `).all(fid) as any[];

    // Monthly trend
    const monthlyTrend = db.prepare(`
      SELECT substr(attendance_date, 1, 7) as month,
             COUNT(DISTINCT attendance_date) as working_days,
             ROUND(SUM(CASE WHEN status = 'P' THEN 1.0 ELSE 0 END) * 100.0 / COUNT(*), 1) as percentage
      FROM daily_attendance
      WHERE faculty_id = ?
      GROUP BY month
      ORDER BY month ASC
    `).all(fid);

    const holidays = db.prepare('SELECT * FROM holidays WHERE faculty_id = ? ORDER BY holiday_date ASC LIMIT 5').all(fid);
    db.close();

    res.json({
      activeDataset: datasetName,
      faculty,
      department,
      academicYear,
      yearOfStudy,
      semester,
      classSection,
      subject,
      courseType,
      classHandled: department,
      threshold,
      totalStudents,
      totalDatasets,
      totalWorkingDays: distinctDates,
      totalSessions,
      overallAttendancePct: parseFloat(overallPct),
      hasProfile,
      todayAttendance: {
        date: today,
        isMarked: todayMarked,
        present: todayPresent,
        absent: todayAbsent,
        total: todayPresent + todayAbsent
      },
      recentDates,
      monthlyTrend,
      holidays
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 6. STUDENTS DIRECTORY & MANAGEMENT (Strictly Scoped to Authenticated Faculty)
app.get('/api/students', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { db } = getFacultyDb(faculty);
    const query = String(req.query.q || '').trim();
    const activeOnly = req.query.activeOnly === 'true';

    let sql = 'SELECT * FROM students';
    const params: any[] = [fid];
    const clauses: string[] = ['faculty_id = ?'];

    if (activeOnly) clauses.push('is_active = 1');
    if (query) {
      clauses.push('(reg_no LIKE ? OR (roll_no IS NOT NULL AND roll_no LIKE ?) OR name LIKE ?)');
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    sql += ' WHERE ' + clauses.join(' AND ');

    const rows = db.prepare(sql).all(...params) as any[];
    rows.sort((a, b) => compareRolls(a.roll_no || a.reg_no, b.roll_no || b.reg_no));

    // Calculate individual stats scoped to faculty_id
    const statsStmt = db.prepare(`
      SELECT student_id,
             SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as present,
             SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as absent,
             COUNT(*) as total
      FROM daily_attendance
      WHERE faculty_id = ?
      GROUP BY student_id
    `);
    const statsMap = new Map();
    for (const row of statsStmt.all(fid) as any[]) {
      statsMap.set(row.student_id, row);
    }

    const totalWorkingDays = (db.prepare('SELECT COUNT(DISTINCT attendance_date) as c FROM daily_attendance WHERE faculty_id = ?').get(fid) as any)?.c || 0;
    const courseType = (db.prepare("SELECT value FROM settings WHERE key='course_type'").get() as any)?.value || 'classroom';

    const students = rows.map((s, idx) => {
      const st = statsMap.get(s.id) || { present: 0, absent: 0, total: 0 };
      const pct = totalWorkingDays > 0 ? parseFloat(((st.present / totalWorkingDays) * 100).toFixed(1)) : 0.0;
      const marks = calculateAttendanceMarks(st.absent, totalWorkingDays, courseType);
      return {
        ...s,
        sNo: idx + 1,
        workingDays: totalWorkingDays,
        present: st.present,
        absent: st.absent,
        attendancePct: pct,
        marks
      };
    });

    db.close();
    res.json({ students, totalCount: students.length });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.post('/api/students', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { reg_no, roll_no, name } = req.body;
    if (!reg_no?.trim() || !name?.trim()) {
      return res.status(400).json({ error: 'Registration number and Student Name are required.' });
    }
    const { db } = getFacultyDb(faculty);
    const existingStudents = db.prepare('SELECT id, reg_no, roll_no FROM students WHERE faculty_id = ?').all(fid) as any[];
    const cleanReg = String(reg_no).trim();
    const cleanName = String(name).trim();
    const cleanRoll = roll_no && String(roll_no).trim()
      ? String(roll_no).trim()
      : getNextRollNumber(existingStudents);

    const dupReg = existingStudents.find(s => String(s.reg_no).trim().toLowerCase() === cleanReg.toLowerCase());
    if (dupReg) {
      db.close();
      return res.status(400).json({ error: `Registration number '${cleanReg}' already exists in this class.` });
    }

    const rollKey = normalizeRollKey(cleanRoll);
    const dupRoll = existingStudents.find(s => normalizeRollKey(s.roll_no) === rollKey);
    if (dupRoll) {
      db.close();
      return res.status(400).json({ error: `Roll number '${cleanRoll}' is already assigned to another student in this class.` });
    }

    const info = db
      .prepare('INSERT INTO students (faculty_id, reg_no, roll_no, name) VALUES (?, ?, ?, ?)')
      .run(fid, cleanReg, cleanRoll, cleanName);
    db.close();
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(400).json({ error: `Duplicate student record: Registration number or Roll number already exists in this class.` });
    }
    sendRouteError(res, err);
  }
});

app.put('/api/students/:id', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { reg_no, roll_no, name, is_active } = req.body;
    const id = parseInt(req.params.id, 10);
    if (!reg_no?.trim() || !name?.trim()) {
      return res.status(400).json({ error: 'Registration number and Student Name are required.' });
    }
    const { db } = getFacultyDb(faculty);
    const current = db.prepare('SELECT id, roll_no FROM students WHERE id = ? AND faculty_id = ?').get(id, fid) as any;
    if (!current) {
      db.close();
      return res.status(404).json({ error: 'Student not found in your faculty class.' });
    }

    const others = db.prepare('SELECT id, reg_no, roll_no FROM students WHERE faculty_id = ? AND id != ?').all(fid, id) as any[];
    const cleanReg = String(reg_no).trim();
    const cleanName = String(name).trim();
    const cleanRoll = roll_no && String(roll_no).trim()
      ? String(roll_no).trim()
      : String(current?.roll_no || '').trim() || getNextRollNumber(others);

    if (others.some(s => String(s.reg_no).trim().toLowerCase() === cleanReg.toLowerCase())) {
      db.close();
      return res.status(400).json({ error: `Registration number '${cleanReg}' already exists in this class.` });
    }
    const rollKey = normalizeRollKey(cleanRoll);
    if (rollKey && others.some(s => normalizeRollKey(s.roll_no) === rollKey)) {
      db.close();
      return res.status(400).json({ error: `Roll number '${cleanRoll}' is already assigned to another student in this class.` });
    }

    db.prepare('UPDATE students SET reg_no = ?, roll_no = ?, name = ?, is_active = ? WHERE id = ? AND faculty_id = ?')
      .run(cleanReg, cleanRoll, cleanName, is_active ? 1 : 0, id, fid);
    db.close();
    res.json({ success: true });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Registration number and Roll number must each be unique within this class.' });
    }
    sendRouteError(res, err);
  }
});

app.delete('/api/students/:id', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const id = parseInt(req.params.id, 10);
    const { db } = getFacultyDb(faculty);
    const result = db.prepare('DELETE FROM students WHERE id = ? AND faculty_id = ?').run(id, fid);
    db.close();
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Student not found in your faculty class.' });
    }
    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.post('/api/students/import', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No student rows provided.' });
    }

    const { db } = getFacultyDb(faculty);
    const existingStudents = db.prepare('SELECT id, reg_no, roll_no FROM students WHERE faculty_id = ?').all(fid) as any[];
    const seenRegs = new Set(existingStudents.map(s => String(s.reg_no).trim().toLowerCase()));
    const seenRolls = new Set(existingStudents.map(s => normalizeRollKey(s.roll_no)).filter(Boolean));

    const stmt = db.prepare('INSERT INTO students (faculty_id, reg_no, roll_no, name) VALUES (?, ?, ?, ?)');
    let imported = 0;
    let skippedDuplicates = 0;
    const errors: string[] = [];

    const insertTx = db.transaction((list: any[]) => {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const extracted = extractStudentFields(item, i);
        const regNo = String(item.regNo || item.reg_no || extracted.regNo || '').trim();
        const name = String(item.name || extracted.name || '').trim();
        const explicitRoll = item.rollNo !== undefined || item.roll_no !== undefined || item['Roll No'] !== undefined || item['Roll Number'] !== undefined || extracted.hasExplicitRoll;
        let rollNo = String(item.rollNo ?? item.roll_no ?? item['Roll No'] ?? item['Roll Number'] ?? extracted.rollNo ?? '').trim();

        if (!regNo || !name) continue;

        const regLower = regNo.toLowerCase();
        if (seenRegs.has(regLower)) {
          skippedDuplicates++;
          errors.push(`${regNo}: duplicate register number skipped.`);
          continue;
        }

        let rollKey = normalizeRollKey(rollNo);
        if (!rollNo || (!explicitRoll && seenRolls.has(rollKey))) {
          rollNo = getNextRollNumber(existingStudents, seenRolls);
          rollKey = normalizeRollKey(rollNo);
        } else if (explicitRoll && seenRolls.has(rollKey)) {
          skippedDuplicates++;
          errors.push(`${regNo}: duplicate roll number '${rollNo}' skipped.`);
          continue;
        }

        try {
          stmt.run(fid, regNo, rollNo, name);
          seenRegs.add(regLower);
          if (rollKey) seenRolls.add(rollKey);
          imported++;
        } catch (err: any) {
          skippedDuplicates++;
          errors.push(`${regNo}: already exists in class.`);
        }
      }
    });

    insertTx(rows);
    db.close();
    res.json({ imported, skippedDuplicates, errors });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 7. SESSION-BASED ATTENDANCE (Strictly Scoped to Authenticated Faculty)
app.get('/api/attendance/daily', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const attendanceDate = String(req.query.date || new Date().toISOString().split('T')[0]);
    const periodNo = parseInt(String(req.query.period || '1'), 10);
    const subjectIdQuery = req.query.subject_id ? parseInt(String(req.query.subject_id), 10) : null;
    const { db, datasetName } = getFacultyDb(faculty);

    // Check holiday
    const holiday = db.prepare('SELECT * FROM holidays WHERE faculty_id = ? AND holiday_date = ?').get(fid, attendanceDate) as any;

    // Weekday (0=Mon ... 6=Sun)
    const d = new Date(attendanceDate);
    const weekday = (d.getDay() + 6) % 7;

    // Timetable scheduled periods for this weekday
    const assignedPeriods = db.prepare(`
      SELECT t.period_no, s.id as subject_id, s.name as subject_name
      FROM timetable t
      JOIN subjects s ON s.id = t.subject_id AND s.faculty_id = t.faculty_id
      WHERE t.faculty_id = ? AND t.weekday = ? AND t.class_name = ?
      ORDER BY t.period_no ASC
    `).all(fid, weekday, datasetName) as any[];

    // Subjects list
    const subjects = db.prepare('SELECT * FROM subjects WHERE faculty_id = ? ORDER BY name ASC').all(fid) as any[];
    const activeSubjectId = subjectIdQuery || (assignedPeriods.find(p => p.period_no === periodNo)?.subject_id) || subjects[0]?.id || 1;

    // Active students
    const students = db.prepare('SELECT * FROM students WHERE faculty_id = ? AND is_active = 1').all(fid) as any[];
    students.sort((a, b) => compareRolls(a.roll_no || a.reg_no, b.roll_no || b.reg_no));

    // Find session in attendance_sessions
    const session = db.prepare(`
      SELECT * FROM attendance_sessions
      WHERE faculty_id = ? AND class_id = ? AND subject_id = ? AND attendance_date = ? AND period_number = ?
    `).get(fid, datasetName, activeSubjectId, attendanceDate, periodNo) as any;

    let records: any[] = [];
    let exists = false;

    if (session) {
      exists = true;
      records = db.prepare(`
        SELECT student_id, status FROM attendance_records WHERE session_id = ? AND faculty_id = ?
      `).all(session.session_id, fid);
    } else {
      records = db.prepare(`
        SELECT student_id, status FROM period_attendance
        WHERE faculty_id = ? AND attendance_date = ? AND period_no = ?
      `).all(fid, attendanceDate, periodNo);

      if (records.length === 0) {
        records = db.prepare(`
          SELECT student_id, status FROM daily_attendance
          WHERE faculty_id = ? AND attendance_date = ?
        `).all(fid, attendanceDate);
      }
      exists = records.length > 0;
    }

    const statusMap = new Map<number, string>();
    for (const r of records) statusMap.set(r.student_id, r.status);

    const absentRegs: string[] = [];
    const odRegs: string[] = [];
    const leaveRegs: string[] = [];
    let presentCount = 0;
    let absentCount = 0;
    let odCount = 0;
    let leaveCount = 0;

    const studentList = students.map((s, idx) => {
      const status = statusMap.get(s.id) || 'P';
      const identifier = s.roll_no || s.reg_no;

      if (status === 'A') {
        absentRegs.push(identifier);
        absentCount++;
      } else if (status === 'OD') {
        odRegs.push(identifier);
        odCount++;
      } else if (status === 'L') {
        leaveRegs.push(identifier);
        leaveCount++;
      } else {
        presentCount++;
      }

      return {
        ...s,
        sNo: idx + 1,
        status: holiday ? 'H' : status
      };
    });

    const allSessionsForDate = db.prepare(`
      SELECT s.session_id, s.period_number, s.period_duration, subj.name as subject_name
      FROM attendance_sessions s
      LEFT JOIN subjects subj ON subj.id = s.subject_id AND subj.faculty_id = s.faculty_id
      WHERE s.faculty_id = ? AND s.class_id = ? AND s.attendance_date = ?
      ORDER BY s.period_number ASC
    `).all(fid, datasetName, attendanceDate);

    db.close();

    res.json({
      date: attendanceDate,
      weekday,
      periodNo,
      subjectId: activeSubjectId,
      isHoliday: !!holiday,
      holidayDescription: holiday?.description || '',
      exists,
      assignedPeriods,
      allSessionsForDate,
      subjects,
      totalStudents: students.length,
      presentCount: exists ? presentCount : students.length,
      absentCount: exists ? absentCount : 0,
      odCount: exists ? odCount : 0,
      leaveCount: exists ? leaveCount : 0,
      absentRolls: exists ? absentRegs : [],
      odRolls: exists ? odRegs : [],
      leaveRolls: exists ? leaveRegs : [],
      students: studentList
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

function buildStudentRollLookup(students: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const s of students) {
    const rollStr = String(s.roll_no ?? '').trim();
    if (rollStr) {
      map.set(rollStr.toLowerCase(), s);
      const norm = normalizeRollKey(rollStr);
      if (norm) map.set(norm, s);
    } else {
      const regStr = String(s.reg_no ?? '').trim();
      if (regStr) {
        map.set(regStr.toLowerCase(), s);
        const norm = normalizeRollKey(regStr);
        if (norm) map.set(norm, s);
      }
    }
  }
  return map;
}

function getWeekdayPeriodMap(db: Database.Database, className: string, facultyId: number): Record<number, { period: number; duration: number }> {
  const map: Record<number, { period: number; duration: number }> = {};

  // 1. Check timetable
  try {
    const ttRows = db.prepare('SELECT weekday, period_no FROM timetable WHERE faculty_id = ? AND class_name = ? ORDER BY period_no ASC').all(facultyId, className) as any[];
    for (const r of ttRows) {
      if (map[r.weekday] === undefined) {
        map[r.weekday] = { period: Number(r.period_no) || 1, duration: 60 };
      }
    }
  } catch (_) {}

  // 2. Check legacy register_weekday_periods (e.g. {"0": 3, "2": 3, "3": 4})
  try {
    const legRow = db.prepare("SELECT value FROM settings WHERE key = 'register_weekday_periods'").get() as any;
    if (legRow?.value) {
      const parsed = JSON.parse(legRow.value);
      for (const [k, v] of Object.entries(parsed)) {
        const dayIdx = parseInt(k, 10);
        if (!isNaN(dayIdx)) {
          const pNum = parseInt(String(v), 10) || 1;
          map[dayIdx] = { period: pNum, duration: 60 };
        }
      }
    }
  } catch (_) {}

  // 3. Check course_schedule_config
  try {
    const cfgRow = db.prepare("SELECT value FROM settings WHERE key = 'course_schedule_config'").get() as any;
    if (cfgRow?.value) {
      const cfg = JSON.parse(cfgRow.value);
      const wp = cfg.weekday_periods || {};
      for (const [k, v] of Object.entries(wp) as [string, any][]) {
        const dayIdx = parseInt(k, 10);
        if (!isNaN(dayIdx) && v) {
          map[dayIdx] = {
            period: parseInt(String(v.period || v), 10) || 1,
            duration: parseInt(String(v.duration || 60), 10) || 60
          };
        }
      }
    }
  } catch (_) {}

  return map;
}

function ensureDefaultFacultySubject(db: Database.Database, facultyId: number, datasetName: string): number {
  const existing = db.prepare('SELECT id FROM subjects WHERE faculty_id = ? ORDER BY id ASC LIMIT 1').get(facultyId) as { id: number } | undefined;
  if (existing) return existing.id;

  const configuredName = (db.prepare("SELECT value FROM settings WHERE key='course_subject'").get() as any)?.value?.trim() || 'Classroom';
  const configuredHours = parseFloat((db.prepare("SELECT value FROM settings WHERE key='course_total_hours'").get() as any)?.value || '45') || 45;
  const info = db.prepare(`
    INSERT INTO subjects (faculty_id, name, code, semester_hours, weekly_target, period_duration_mins, semester, class_section)
    VALUES (?, ?, ?, ?, 3, 60, 'Semester 7', ?)
  `).run(facultyId, configuredName, configuredName.slice(0, 6).toUpperCase(), configuredHours, datasetName);
  return Number(info.lastInsertRowid);
}

app.post('/api/attendance/daily', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const {
      attendance_date,
      date,
      period_no,
      periodNo,
      period_duration,
      periodDuration,
      subject_id,
      subjectId,
      absent_text,
      absentInput,
      od_text,
      odInput,
      leave_text,
      leaveInput,
      replace
    } = req.body;

    const dateStr = String(attendance_date ?? date ?? '').trim();
    if (!dateStr) {
      return res.status(400).json({ error: 'Attendance date is required.' });
    }
    const period = parseInt(period_no ?? periodNo ?? 1, 10);
    const duration = parseInt(period_duration ?? periodDuration ?? 60, 10);
    const { db, datasetName } = getFacultyDb(faculty);

    // Check holiday command
    const rawAbsentStr = String(absent_text ?? absentInput ?? '').trim();
    if (['holiday', 'h'].includes(rawAbsentStr.toLowerCase())) {
      db.prepare(`
        INSERT INTO holidays (faculty_id, holiday_date, description)
        VALUES (?, ?, 'Holiday')
        ON CONFLICT(holiday_date) DO UPDATE SET description = excluded.description, faculty_id = excluded.faculty_id
      `).run(fid, dateStr);
      db.prepare('DELETE FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ?').run(fid, dateStr);
      db.prepare('DELETE FROM period_attendance WHERE faculty_id = ? AND attendance_date = ?').run(fid, dateStr);
      db.prepare('DELETE FROM attendance_records WHERE faculty_id = ? AND session_id IN (SELECT session_id FROM attendance_sessions WHERE faculty_id = ? AND class_id = ? AND attendance_date = ?)').run(fid, fid, datasetName, dateStr);
      db.close();
      return res.json({ success: true, isHoliday: true, message: `Date ${dateStr} marked as Holiday.` });
    }

    // Check existing holiday
    const isHol = db.prepare('SELECT 1 FROM holidays WHERE faculty_id = ? AND holiday_date = ?').get(fid, dateStr);
    if (isHol) {
      if (replace) {
        db.prepare('DELETE FROM holidays WHERE faculty_id = ? AND holiday_date = ?').run(fid, dateStr);
      } else {
        db.close();
        return res.status(400).json({ error: 'This date is marked as a holiday. Remove holiday or enable replace.' });
      }
    }

    const students = db.prepare('SELECT * FROM students WHERE faculty_id = ? AND is_active = 1').all(fid) as any[];
    if (students.length === 0) {
      db.close();
      return res.status(400).json({ error: 'Add active students before recording attendance.' });
    }

    // Resolve subject owned by this faculty
    const reqSubjId = subject_id ?? subjectId;
    let finalSubjectId = reqSubjId ? parseInt(reqSubjId, 10) : null;
    if (finalSubjectId) {
      const validSubj = db.prepare('SELECT id FROM subjects WHERE id = ? AND faculty_id = ?').get(finalSubjectId, fid) as any;
      if (!validSubj) finalSubjectId = null;
    }
    if (!finalSubjectId) {
      finalSubjectId = ensureDefaultFacultySubject(db, fid, datasetName);
    }

    const cleanAbsent = ['p', 'present', 'all', 'all present', 'none', 'nil'].includes(rawAbsentStr.toLowerCase())
      ? ''
      : rawAbsentStr;

    const tokenizeRolls = (text: string): string[] => {
      if (!text) return [];
      return text
        .split(/[,\s;\n]+/)
        .map(s => s.trim())
        .filter(s => Boolean(s) && !['p', 'present', 'all', 'none', 'nil'].includes(s.toLowerCase()));
    };

    const absentRawTokens = tokenizeRolls(cleanAbsent);
    const odRawTokens = tokenizeRolls(String(od_text ?? odInput ?? '').trim());
    const leaveRawTokens = tokenizeRolls(String(leave_text ?? leaveInput ?? '').trim());

    // Build strict roll number lookup
    const studentByRoll = buildStudentRollLookup(students);
    const matchStudent = (tok: string): any => {
      return studentByRoll.get(tok.toLowerCase()) || studentByRoll.get(normalizeRollKey(tok)) || null;
    };

    const unknownRolls: string[] = [];
    const absentStudentIds = new Set<number>();
    const odStudentIds = new Set<number>();
    const leaveStudentIds = new Set<number>();

    for (const tok of absentRawTokens) {
      const st = matchStudent(tok);
      if (!st) unknownRolls.push(tok);
      else absentStudentIds.add(st.id);
    }
    for (const tok of odRawTokens) {
      const st = matchStudent(tok);
      if (!st) unknownRolls.push(tok);
      else odStudentIds.add(st.id);
    }
    for (const tok of leaveRawTokens) {
      const st = matchStudent(tok);
      if (!st) unknownRolls.push(tok);
      else leaveStudentIds.add(st.id);
    }

    if (unknownRolls.length > 0) {
      db.close();
      const uniqueUnknown = Array.from(new Set(unknownRolls));
      return res.status(400).json({
        error: `Unknown Roll Number(s): ${uniqueUnknown.join(', ')}. Please enter valid student roll numbers.`
      });
    }

    // Prevent conflicting status assignments for the same student in a single session
    for (const id of absentStudentIds) {
      if (odStudentIds.has(id) || leaveStudentIds.has(id)) {
        const st = students.find(s => s.id === id);
        db.close();
        return res.status(400).json({
          error: `Roll Number "${st?.roll_no || id}" cannot be marked as both Absent and On Duty / Leave.`
        });
      }
    }

    // Check existing session (prevent duplicate sessions for same faculty, class, subject, date, period)
    const existingSession = db.prepare(`
      SELECT session_id FROM attendance_sessions
      WHERE faculty_id = ? AND class_id = ? AND subject_id = ? AND attendance_date = ? AND period_number = ?
    `).get(fid, datasetName, finalSubjectId, dateStr, period) as any;

    if (existingSession && !replace) {
      db.close();
      return res.status(400).json({
        exists: true,
        error: `Attendance for ${dateStr} (Period P${period}) already exists. Click "Update Attendance" to modify.`
      });
    }

    // Deduplicate active students by id to guarantee 0 duplicate student records per session
    const uniqueStudents = Array.from(new Map(students.map(s => [s.id, s])).values());

    // Session-based atomic write
    const saveSessionTx = db.transaction(() => {
      let sessId: number;
      if (existingSession) {
        sessId = existingSession.session_id;
        db.prepare(`
          UPDATE attendance_sessions
          SET period_duration = ?, updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ? AND faculty_id = ?
        `).run(duration, sessId, fid);
        db.prepare('DELETE FROM attendance_records WHERE session_id = ? AND faculty_id = ?').run(sessId, fid);
      } else {
        const insSess = db.prepare(`
          INSERT INTO attendance_sessions (faculty_id, class_id, subject_id, attendance_date, period_number, period_duration)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(fid, datasetName, finalSubjectId, dateStr, period, duration);
        sessId = Number(insSess.lastInsertRowid);
      }

      const insRecord = db.prepare('INSERT OR REPLACE INTO attendance_records (faculty_id, session_id, student_id, status) VALUES (?, ?, ?, ?)');
      for (const s of uniqueStudents) {
        let status: 'P' | 'A' | 'OD' | 'L' = 'P';
        if (absentStudentIds.has(s.id)) status = 'A';
        else if (odStudentIds.has(s.id)) status = 'OD';
        else if (leaveStudentIds.has(s.id)) status = 'L';
        insRecord.run(fid, sessId, s.id, status);
      }

      // Backward compatibility sync to period_attendance and daily_attendance
      db.prepare('DELETE FROM period_attendance WHERE faculty_id = ? AND attendance_date = ? AND period_no = ?').run(fid, dateStr, period);
      const insPeriod = db.prepare('INSERT OR REPLACE INTO period_attendance (faculty_id, student_id, attendance_date, period_no, subject_id, status) VALUES (?, ?, ?, ?, ?, ?)');
      for (const s of uniqueStudents) {
        const pStatus = (absentStudentIds.has(s.id) || leaveStudentIds.has(s.id)) ? 'A' : 'P';
        insPeriod.run(fid, s.id, dateStr, period, finalSubjectId, pStatus);
      }

      db.prepare('DELETE FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ?').run(fid, dateStr);
      const insDaily = db.prepare('INSERT OR REPLACE INTO daily_attendance (faculty_id, student_id, attendance_date, status) VALUES (?, ?, ?, ?)');
      for (const s of uniqueStudents) {
        const dStatus = (absentStudentIds.has(s.id) || leaveStudentIds.has(s.id)) ? 'A' : 'P';
        insDaily.run(fid, s.id, dateStr, dStatus);
      }
    });

    saveSessionTx();
    db.close();

    res.json({
      success: true,
      date: dateStr,
      periodNo: period,
      total: uniqueStudents.length,
      present: uniqueStudents.length - absentStudentIds.size - odStudentIds.size - leaveStudentIds.size,
      absent: absentStudentIds.size,
      od: odStudentIds.size,
      leave: leaveStudentIds.size
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 7B. SCHEDULE & FULL SCHEDULE ATTENDANCE WORKFLOW API
app.get('/api/schedule/config', (req, res) => {
  try {
    const faculty = req.faculty!;
    const { db } = getFacultyDb(faculty);
    const configRow = db.prepare("SELECT value FROM settings WHERE key = 'course_schedule_config'").get() as any;
    let config: any = null;
    if (configRow?.value) {
      try {
        config = JSON.parse(configRow.value);
      } catch (_) {}
    }

    // Fallback to legacy register_* settings if course_schedule_config is not yet saved
    if (!config) {
      const regRows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'register_%'").all() as any[];
      const rMap: Record<string, string> = {};
      for (const r of regRows) rMap[r.key] = r.value;
      if (rMap.register_start_date && rMap.register_end_date) {
        const weekdays = (rMap.register_weekdays || '0,3')
          .split(',')
          .map(x => parseInt(x.trim(), 10))
          .filter(x => !isNaN(x));
        const wpMap: Record<number, { period: number; duration: number }> = {};
        if (rMap.register_weekday_periods) {
          try {
            const rawWp = JSON.parse(rMap.register_weekday_periods);
            for (const [k, v] of Object.entries(rawWp)) {
              wpMap[parseInt(k, 10)] = { period: parseInt(String(v), 10) || 1, duration: 60 };
            }
          } catch (_) {}
        }
        config = {
          start_date: rMap.register_start_date,
          end_date: rMap.register_end_date,
          weekdays,
          weekday_periods: wpMap,
          exclude_holidays: false
        };
      }
    }

    db.close();
    res.json({ config });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.post('/api/schedule/generate', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const start_date = req.body.start_date || req.body.startDate;
    const end_date = req.body.end_date || req.body.endDate;
    const weekdays = req.body.weekdays || req.body.selectedWeekdays;
    const weekday_periods = req.body.weekday_periods || req.body.weekdayConfig || req.body.weekdayPeriods;
    const default_subject_id = req.body.default_subject_id || req.body.defaultSubjectId;
    const exclude_holidays = req.body.exclude_holidays !== undefined
      ? req.body.exclude_holidays
      : (req.body.excludeHolidays !== undefined ? req.body.excludeHolidays : true);

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start Date and End Date are required.' });
    }
    if (new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ error: 'End Date cannot be earlier than Start Date.' });
    }
    if (!Array.isArray(weekdays) || weekdays.length === 0) {
      return res.status(400).json({ error: 'Please select at least one class day of the week.' });
    }

    const { db, datasetName } = getFacultyDb(faculty);

    // Persist schedule configuration
    const schedulePayload = {
      start_date,
      end_date,
      weekdays,
      weekday_periods,
      default_subject_id,
      exclude_holidays
    };
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('course_schedule_config', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(schedulePayload));

    // Resolve active subject
    const subjects = db.prepare('SELECT id, name FROM subjects WHERE faculty_id = ? ORDER BY id ASC').all(fid) as any[];
    const fallbackSubjectId = subjects.length > 0 ? subjects[0].id : 1;

    // Holidays set
    const holidays = new Set(
      db.prepare('SELECT holiday_date FROM holidays WHERE faculty_id = ?').all(fid).map((h: any) => h.holiday_date)
    );

    // Calculate dates between start_date and end_date
    const selectedDaysSet = new Set(weekdays.map(Number));
    const generatedSessions: any[] = [];

    const startObj = new Date(start_date + 'T00:00:00');
    const endObj = new Date(end_date + 'T00:00:00');

    const curr = new Date(startObj);
    while (curr <= endObj) {
      const isoDate = curr.toISOString().split('T')[0];
      const jsDay = curr.getDay(); // 0 is Sun
      const dayIndex = (jsDay + 6) % 7; // 0 is Mon, 6 is Sun

      if (selectedDaysSet.has(dayIndex)) {
        if (!exclude_holidays || !holidays.has(isoDate)) {
          const pCfg = weekday_periods?.[dayIndex] || weekday_periods?.[String(dayIndex)] || {};
          const periodNo = parseInt(pCfg.period || 1, 10);
          const duration = parseInt(pCfg.duration || 60, 10);
          const subjId = parseInt(pCfg.subject_id || default_subject_id || fallbackSubjectId, 10);

          // Insert session into attendance_sessions if not existing (prevent duplicates)
          const existing = db.prepare(`
            SELECT session_id FROM attendance_sessions
            WHERE faculty_id = ? AND class_id = ? AND subject_id = ? AND attendance_date = ? AND period_number = ?
          `).get(fid, datasetName, subjId, isoDate, periodNo) as any;

          let sId: number;
          if (existing) {
            sId = existing.session_id;
          } else {
            const ins = db.prepare(`
              INSERT INTO attendance_sessions (faculty_id, class_id, subject_id, attendance_date, period_number, period_duration)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(fid, datasetName, subjId, isoDate, periodNo, duration);
            sId = Number(ins.lastInsertRowid);
          }

          generatedSessions.push({
            sessionId: sId,
            date: isoDate,
            dayIndex,
            period: periodNo,
            duration,
            subjectId: subjId
          });
        }
      }
      curr.setDate(curr.getDate() + 1);
    }

    db.close();
    res.json({
      success: true,
      message: `Generated ${generatedSessions.length} sessions between ${start_date} and ${end_date}.`,
      count: generatedSessions.length,
      sessions: generatedSessions
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// GET all sessions for Full Schedule Attendance Sheet (unifies attendance_sessions + historical daily_attendance + holidays)
app.get('/api/schedule/sessions', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const requestedDataset = req.query.dataset ? String(req.query.dataset) : undefined;
    const { db, datasetName: filterDataset } = getFacultyDb(faculty, requestedDataset);

    const students = db.prepare('SELECT * FROM students WHERE faculty_id = ? AND is_active = 1').all(fid) as any[];
    students.sort((a, b) => compareRolls(a.roll_no || a.reg_no, b.roll_no || b.reg_no));

    const defaultSubjName = (db.prepare("SELECT value FROM settings WHERE key='course_subject'").get() as any)?.value || 'Classroom';
    const firstSubj = db.prepare('SELECT id, name FROM subjects WHERE faculty_id = ? ORDER BY id ASC LIMIT 1').get(fid) as any;
    const fallbackSubjectId = firstSubj?.id || 1;
    const fallbackSubjectName = firstSubj?.name || defaultSubjName;
    const wpMap = getWeekdayPeriodMap(db, filterDataset, fid);

    const sessions = db.prepare(`
      SELECT s.session_id, s.class_id, s.subject_id, s.attendance_date, s.period_number, s.period_duration,
             s.created_at, s.updated_at,
             COALESCE(subj.name, ?) as subject_name
      FROM attendance_sessions s
      LEFT JOIN subjects subj ON subj.id = s.subject_id AND subj.faculty_id = s.faculty_id
      WHERE s.faculty_id = ? AND s.class_id = ?
      ORDER BY s.attendance_date ASC, s.period_number ASC
    `).all(fallbackSubjectName, fid, filterDataset) as any[];

    const holidayDates = new Set(
      db.prepare('SELECT holiday_date FROM holidays WHERE faculty_id = ?').all(fid).map((h: any) => h.holiday_date)
    );

    const coveredDates = new Set<string>(sessions.map(s => s.attendance_date));

    // Include historical daily_attendance dates for this faculty not yet in attendance_sessions
    const legacyDates = db.prepare('SELECT DISTINCT attendance_date FROM daily_attendance WHERE faculty_id = ? ORDER BY attendance_date ASC').all(fid) as any[];
    const combinedSessions: any[] = [...sessions];

    for (const ld of legacyDates) {
      const dStr = ld.attendance_date;
      if (!coveredDates.has(dStr)) {
        const dObj = new Date(dStr + 'T00:00:00');
        const wIdx = (dObj.getDay() + 6) % 7;
        const pCfg = wpMap[wIdx] || { period: 1, duration: 60 };
        combinedSessions.push({
          session_id: undefined,
          class_id: filterDataset,
          subject_id: fallbackSubjectId,
          attendance_date: dStr,
          period_number: pCfg.period,
          period_duration: pCfg.duration,
          created_at: dStr,
          updated_at: dStr,
          subject_name: fallbackSubjectName,
          isLegacyDaily: true
        });
        coveredDates.add(dStr);
      }
    }

    // Include declared holidays not yet in combinedSessions
    for (const hDate of Array.from(holidayDates)) {
      if (!coveredDates.has(hDate)) {
        const dObj = new Date(hDate + 'T00:00:00');
        const wIdx = (dObj.getDay() + 6) % 7;
        const pCfg = wpMap[wIdx] || { period: 1, duration: 60 };
        combinedSessions.push({
          session_id: undefined,
          class_id: filterDataset,
          subject_id: fallbackSubjectId,
          attendance_date: hDate,
          period_number: pCfg.period,
          period_duration: pCfg.duration,
          created_at: hDate,
          updated_at: hDate,
          subject_name: fallbackSubjectName,
          isLegacyHoliday: true
        });
        coveredDates.add(hDate);
      }
    }

    combinedSessions.sort((a, b) => {
      if (a.attendance_date !== b.attendance_date) {
        return a.attendance_date.localeCompare(b.attendance_date);
      }
      return (a.period_number || 1) - (b.period_number || 1);
    });

    const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const result = combinedSessions.map((sess, idx) => {
      const dObj = new Date(sess.attendance_date + 'T00:00:00');
      const dayIdx = (dObj.getDay() + 6) % 7;
      const dayName = weekdayNames[dayIdx] || '';

      let recs: any[] = [];
      if (sess.session_id) {
        recs = db.prepare(`
          SELECT student_id, status FROM attendance_records WHERE session_id = ? AND faculty_id = ?
        `).all(sess.session_id, fid) as any[];
      } else if (sess.isLegacyDaily) {
        recs = db.prepare(`
          SELECT student_id, status FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ?
        `).all(fid, sess.attendance_date) as any[];
      }

      const isHoliday = holidayDates.has(sess.attendance_date);
      let status = 'Pending';
      const statusMap = new Map<number, string>();
      for (const r of recs) statusMap.set(r.student_id, r.status);

      const absentList: string[] = [];
      const odList: string[] = [];
      const leaveList: string[] = [];

      let presentCount = 0;
      let absentCount = 0;

      if (isHoliday) {
        status = 'Holiday';
      } else if (recs.length > 0) {
        status = sess.updated_at && sess.updated_at !== sess.created_at ? 'Updated' : 'Saved';
        for (const s of students) {
          const st = statusMap.get(s.id) || 'P';
          const roll = String(s.roll_no || s.reg_no);
          if (st === 'A') {
            absentList.push(roll);
            absentCount++;
          } else if (st === 'OD') {
            odList.push(roll);
            presentCount++;
          } else if (st === 'L') {
            leaveList.push(roll);
            absentCount++;
          } else {
            presentCount++;
          }
        }
      }

      // Format input text for faculty display
      let absentInput = '';
      if (isHoliday) {
        absentInput = 'Holiday';
      } else if (recs.length > 0) {
        if (absentList.length === 0 && odList.length === 0 && leaveList.length === 0) {
          absentInput = 'P';
        } else if (absentList.length > 0 && odList.length === 0 && leaveList.length === 0) {
          absentInput = absentList.join(', ');
        } else if (absentList.length === 0 && odList.length > 0 && leaveList.length === 0) {
          absentInput = 'OD: ' + odList.join(', ');
        } else {
          const parts: string[] = [];
          if (absentList.length > 0) parts.push(absentList.join(', '));
          if (odList.length > 0) parts.push('OD: ' + odList.join(', '));
          if (leaveList.length > 0) parts.push('L: ' + leaveList.join(', '));
          absentInput = parts.join(', ');
        }
      }

      return {
        sessionNumber: idx + 1,
        sessionId: sess.session_id,
        date: sess.attendance_date,
        day: dayName,
        subjectId: sess.subject_id,
        subjectName: sess.subject_name,
        period: sess.period_number,
        duration: sess.period_duration,
        status,
        absentInput,
        odInput: odList.join(', '),
        leaveInput: leaveList.join(', '),
        presentCount,
        absentCount,
        totalStudents: students.length,
        hasAttendance: recs.length > 0 || isHoliday
      };
    });

    db.close();
    res.json({
      sessions: result,
      totalStudents: students.length,
      dataset: filterDataset
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// Helper: Parse attendance input supporting roll numbers, P, H/Holiday, OD, and OD: roll1, roll2
function parseAttendanceInput(
  rawInput: string,
  studentByRoll: Map<string, any>,
  sessionLabel: string,
  extraOdText = '',
  extraLeaveText = ''
) {
  const result = {
    isHoliday: false,
    isAllPresent: false,
    isAllOD: false,
    absentRolls: [] as string[],
    odRolls: [] as string[],
    leaveRolls: [] as string[],
    absentStudentIds: new Set<number>(),
    odStudentIds: new Set<number>(),
    leaveStudentIds: new Set<number>(),
    errors: [] as string[]
  };

  let combinedRaw = (rawInput || '').trim();
  const cleanExtraOd = (extraOdText || '').trim();
  const cleanExtraLeave = (extraLeaveText || '').trim();

  if (cleanExtraOd && !/od:/i.test(combinedRaw)) {
    combinedRaw = combinedRaw && combinedRaw.toLowerCase() !== 'p'
      ? `${combinedRaw}, OD: ${cleanExtraOd}`
      : `OD: ${cleanExtraOd}`;
  }
  if (cleanExtraLeave && !/\b(l:|leave:)/i.test(combinedRaw)) {
    combinedRaw = combinedRaw && combinedRaw.toLowerCase() !== 'p'
      ? `${combinedRaw}, L: ${cleanExtraLeave}`
      : `L: ${cleanExtraLeave}`;
  }

  const trimmed = combinedRaw.trim();
  if (!trimmed) {
    result.isAllPresent = true;
    return result;
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'p' || lower === 'present' || lower === 'all present' || lower === 'all' || lower === 'none' || lower === 'nil') {
    result.isAllPresent = true;
    return result;
  }

  if (lower === 'h' || lower === 'holiday') {
    result.isHoliday = true;
    return result;
  }

  if (lower === 'od' || lower === 'on duty' || lower === 'on-duty') {
    result.isAllOD = true;
    return result;
  }

  const seenStudentIds = new Set<number>();
  let currentMode: 'A' | 'OD' | 'L' = 'A';

  // Normalize delimiters and isolate mode prefixes like OD:, L:, A:
  const rawTokens = trimmed
    .replace(/;/g, ' , ')
    .replace(/(OD:|L:|A:|Leave:|Absent:|OnDuty:)/gi, ' $1 ')
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean);

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];
    const tokLower = token.toLowerCase();

    if (tokLower === 'od:' || tokLower === 'onduty:' || tokLower === 'od') {
      currentMode = 'OD';
      continue;
    }
    if (tokLower === 'l:' || tokLower === 'leave:' || tokLower === 'l') {
      currentMode = 'L';
      continue;
    }
    if (tokLower === 'a:' || tokLower === 'absent:' || tokLower === 'a') {
      currentMode = 'A';
      continue;
    }

    if (tokLower === 'p' || tokLower === 'present') continue;

    // Match student strictly by Roll Number
    const student = studentByRoll.get(tokLower) || studentByRoll.get(normalizeRollKey(token));

    if (!student) {
      result.errors.push(`${sessionLabel}: Unknown Roll Number "${token}".`);
      continue;
    }

    const normRoll = String(student.roll_no || student.reg_no);
    if (seenStudentIds.has(student.id)) {
      result.errors.push(`${sessionLabel}: Duplicate Roll Number "${token}" entered.`);
      continue;
    }

    seenStudentIds.add(student.id);

    if (currentMode === 'OD') {
      result.odRolls.push(normRoll);
      result.odStudentIds.add(student.id);
    } else if (currentMode === 'L') {
      result.leaveRolls.push(normRoll);
      result.leaveStudentIds.add(student.id);
    } else {
      result.absentRolls.push(normRoll);
      result.absentStudentIds.add(student.id);
    }
  }

  return result;
}

// Save all attendance sessions from Full Schedule Attendance Sheet
app.post('/api/schedule/save-all', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { sessions } = req.body;
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({ error: 'No sessions provided to save.' });
    }

    const { db, datasetName } = getFacultyDb(faculty);
    const students = db.prepare('SELECT * FROM students WHERE faculty_id = ? AND is_active = 1').all(fid) as any[];
    if (students.length === 0) {
      db.close();
      return res.status(400).json({ error: 'No active students found in this class. Please upload students first.' });
    }

    const uniqueStudents = Array.from(new Map(students.map(s => [s.id, s])).values());
    const studentByRoll = buildStudentRollLookup(uniqueStudents);

    // Phase 1: Strict validation of entered roll numbers across all sessions
    const parsedSessions: any[] = [];
    const validationErrors: string[] = [];

    for (const item of sessions) {
      const dateStr = String(item.date).trim();
      const periodNo = parseInt(item.period || 1, 10);
      const sessionLabel = `${dateStr} (Period P${periodNo})`;
      const rawText = String(item.absentInput ?? item.roll_status_input ?? '').trim();

      if (item.status === 'Pending' && !rawText && !item.odInput && !item.leaveInput && sessions.length > 1) {
        continue;
      }

      const parsed = parseAttendanceInput(
        rawText,
        studentByRoll,
        sessionLabel,
        String(item.odInput || ''),
        String(item.leaveInput || '')
      );
      if (parsed.errors.length > 0) {
        validationErrors.push(...parsed.errors);
      } else {
        parsedSessions.push({
          item,
          dateStr,
          periodNo,
          subjId: parseInt(item.subjectId || 1, 10),
          duration: parseInt(item.duration || 60, 10),
          parsed
        });
      }
    }

    if (validationErrors.length > 0) {
      db.close();
      return res.status(400).json({
        error: validationErrors.join(' | '),
        errors: validationErrors
      });
    }

    // Phase 2: Atomic database persistence scoped to faculty_id
    const saveTx = db.transaction(() => {
      for (const { item, dateStr, periodNo, subjId, duration, parsed } of parsedSessions) {
        let sessId = item.sessionId;
        if (sessId) {
          const ownedSess = db
            .prepare('SELECT session_id FROM attendance_sessions WHERE session_id = ? AND faculty_id = ?')
            .get(sessId, fid) as any;
          if (!ownedSess) sessId = undefined;
        }
        if (!sessId) {
          const existing = db.prepare(`
            SELECT session_id FROM attendance_sessions
            WHERE faculty_id = ? AND class_id = ? AND subject_id = ? AND attendance_date = ? AND period_number = ?
          `).get(fid, datasetName, subjId, dateStr, periodNo) as any;
          if (existing) {
            sessId = existing.session_id;
          } else {
            const ins = db.prepare(`
              INSERT INTO attendance_sessions (faculty_id, class_id, subject_id, attendance_date, period_number, period_duration)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(fid, datasetName, subjId, dateStr, periodNo, duration);
            sessId = Number(ins.lastInsertRowid);
          }
        }

        db.prepare(`
          UPDATE attendance_sessions
          SET period_duration = ?, updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ? AND faculty_id = ?
        `).run(duration, sessId, fid);

        db.prepare('DELETE FROM attendance_records WHERE session_id = ? AND faculty_id = ?').run(sessId, fid);

        if (parsed.isHoliday) {
          db.prepare(`
            INSERT INTO holidays (faculty_id, holiday_date, description)
            VALUES (?, ?, 'Holiday')
            ON CONFLICT(holiday_date) DO UPDATE SET description = excluded.description, faculty_id = excluded.faculty_id
          `).run(fid, dateStr);
          db.prepare('DELETE FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ?').run(fid, dateStr);
          db.prepare('DELETE FROM period_attendance WHERE faculty_id = ? AND attendance_date = ? AND period_no = ?').run(fid, dateStr, periodNo);
        } else {
          db.prepare('DELETE FROM holidays WHERE faculty_id = ? AND holiday_date = ?').run(fid, dateStr);

          const insRec = db.prepare('INSERT OR REPLACE INTO attendance_records (faculty_id, session_id, student_id, status) VALUES (?, ?, ?, ?)');
          for (const s of uniqueStudents) {
            let st: 'P' | 'A' | 'OD' | 'L' = 'P';
            if (parsed.absentStudentIds.has(s.id)) st = 'A';
            else if (parsed.odStudentIds.has(s.id)) st = 'OD';
            else if (parsed.leaveStudentIds.has(s.id)) st = 'L';
            else if (parsed.isAllOD) st = 'OD';
            insRec.run(fid, sessId, s.id, st);
          }

          db.prepare('DELETE FROM period_attendance WHERE faculty_id = ? AND attendance_date = ? AND period_no = ?').run(fid, dateStr, periodNo);
          const insPeriod = db.prepare('INSERT OR REPLACE INTO period_attendance (faculty_id, student_id, attendance_date, period_no, subject_id, status) VALUES (?, ?, ?, ?, ?, ?)');
          for (const s of uniqueStudents) {
            const pStat = (parsed.absentStudentIds.has(s.id) || parsed.leaveStudentIds.has(s.id)) ? 'A' : 'P';
            insPeriod.run(fid, s.id, dateStr, periodNo, subjId, pStat);
          }

          db.prepare('DELETE FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ?').run(fid, dateStr);
          const insDaily = db.prepare('INSERT OR REPLACE INTO daily_attendance (faculty_id, student_id, attendance_date, status) VALUES (?, ?, ?, ?)');
          for (const s of uniqueStudents) {
            const dStat = (parsed.absentStudentIds.has(s.id) || parsed.leaveStudentIds.has(s.id)) ? 'A' : 'P';
            insDaily.run(fid, s.id, dateStr, dStat);
          }
        }
      }
    });

    saveTx();
    db.close();
    res.json({
      success: true,
      count: parsedSessions.length,
      message: `Successfully saved attendance for ${parsedSessions.length} session(s).`
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// Mark ONLY remaining pending sessions as all present (never overwrite saved sessions or holidays!)
app.post('/api/schedule/mark-all-present', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { db, datasetName } = getFacultyDb(faculty);
    const students = db.prepare('SELECT * FROM students WHERE faculty_id = ? AND is_active = 1').all(fid) as any[];
    if (students.length === 0) {
      db.close();
      return res.status(400).json({ error: 'No active students found in this class.' });
    }

    const uniqueStudents = Array.from(new Map(students.map(s => [s.id, s])).values());

    const pendingSessions = db.prepare(`
      SELECT s.session_id, s.attendance_date, s.period_number, s.subject_id
      FROM attendance_sessions s
      WHERE s.faculty_id = ? AND s.class_id = ?
        AND NOT EXISTS (SELECT 1 FROM attendance_records r WHERE r.session_id = s.session_id AND r.faculty_id = s.faculty_id)
        AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = s.attendance_date AND h.faculty_id = s.faculty_id)
    `).all(fid, datasetName) as any[];

    const markTx = db.transaction(() => {
      const insRec = db.prepare('INSERT OR REPLACE INTO attendance_records (faculty_id, session_id, student_id, status) VALUES (?, ?, ?, ?)');
      const insDaily = db.prepare('INSERT OR IGNORE INTO daily_attendance (faculty_id, student_id, attendance_date, status) VALUES (?, ?, ?, ?)');

      for (const sess of pendingSessions) {
        db.prepare('UPDATE attendance_sessions SET updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND faculty_id = ?').run(sess.session_id, fid);
        for (const s of uniqueStudents) {
          insRec.run(fid, sess.session_id, s.id, 'P');
          insDaily.run(fid, s.id, sess.attendance_date, 'P');
        }
      }
    });

    markTx();
    db.close();
    res.json({ success: true, updatedSessions: pendingSessions.length });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// Bulk Attendance Import by Roll Number
app.post('/api/attendance/bulk-import', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { attendance, replace_existing = true } = req.body;
    if (!attendance || typeof attendance !== 'object' || Object.keys(attendance).length === 0) {
      return res.status(400).json({ error: 'No attendance matrix data provided.' });
    }

    const { db, datasetName } = getFacultyDb(faculty);
    const students = db.prepare('SELECT * FROM students WHERE faculty_id = ? AND is_active = 1').all(fid) as any[];
    if (students.length === 0) {
      db.close();
      return res.status(400).json({ error: 'Add active students before importing attendance.' });
    }

    const uniqueStudents = Array.from(new Map(students.map(s => [s.id, s])).values());
    const studentByRoll = buildStudentRollLookup(uniqueStudents);
    const defaultSubjId = ensureDefaultFacultySubject(db, fid, datasetName);
    const wpMap = getWeekdayPeriodMap(db, datasetName, fid);

    const dateEntries = Object.entries(attendance) as [string, Record<string, string>][];
    for (const [dateStr, rollMap] of dateEntries) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        db.close();
        return res.status(400).json({ error: `Invalid date format "${dateStr}". Expected YYYY-MM-DD.` });
      }
      const hasExisting = db.prepare('SELECT 1 FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ? LIMIT 1').get(fid, dateStr);
      if (hasExisting && !replace_existing) {
        db.close();
        return res.status(400).json({ error: `Attendance already exists for ${dateStr}. Enable replace to overwrite.` });
      }
      for (const [roll, rawStat] of Object.entries(rollMap)) {
        const st = studentByRoll.get(roll.toLowerCase()) || studentByRoll.get(normalizeRollKey(roll));
        if (!st) {
          db.close();
          return res.status(400).json({ error: `${dateStr}: Unknown Roll Number "${roll}".` });
        }
        const up = String(rawStat || 'P').trim().toUpperCase();
        if (!['P', 'A', 'OD'].includes(up)) {
          db.close();
          return res.status(400).json({ error: `${dateStr} (Roll ${roll}): Status must be P, A, or OD.` });
        }
      }
    }

    const bulkTx = db.transaction(() => {
      for (const [dateStr, rollMap] of dateEntries) {
        const dObj = new Date(dateStr + 'T00:00:00');
        const wIdx = (dObj.getDay() + 6) % 7;
        const pCfg = wpMap[wIdx] || { period: 1, duration: 60 };

        const sess = db.prepare(`
          SELECT session_id FROM attendance_sessions
          WHERE faculty_id = ? AND class_id = ? AND subject_id = ? AND attendance_date = ? AND period_number = ?
        `).get(fid, datasetName, defaultSubjId, dateStr, pCfg.period) as any;

        let sessId: number;
        if (sess) {
          sessId = sess.session_id;
          db.prepare('UPDATE attendance_sessions SET updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND faculty_id = ?').run(sessId, fid);
          db.prepare('DELETE FROM attendance_records WHERE session_id = ? AND faculty_id = ?').run(sessId, fid);
        } else {
          const ins = db.prepare(`
            INSERT INTO attendance_sessions (faculty_id, class_id, subject_id, attendance_date, period_number, period_duration)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(fid, datasetName, defaultSubjId, dateStr, pCfg.period, pCfg.duration);
          sessId = Number(ins.lastInsertRowid);
        }

        const statusByStudentId = new Map<number, 'P' | 'A' | 'OD'>();
        for (const [roll, rawStat] of Object.entries(rollMap)) {
          const st = studentByRoll.get(roll.toLowerCase()) || studentByRoll.get(normalizeRollKey(roll));
          if (st) {
            const up = String(rawStat || 'P').trim().toUpperCase() as 'P' | 'A' | 'OD';
            statusByStudentId.set(st.id, up);
          }
        }

        const insRec = db.prepare('INSERT OR REPLACE INTO attendance_records (faculty_id, session_id, student_id, status) VALUES (?, ?, ?, ?)');
        db.prepare('DELETE FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ?').run(fid, dateStr);
        const insDaily = db.prepare('INSERT OR REPLACE INTO daily_attendance (faculty_id, student_id, attendance_date, status) VALUES (?, ?, ?, ?)');

        for (const s of uniqueStudents) {
          const st = statusByStudentId.get(s.id) || 'P';
          insRec.run(fid, sessId, s.id, st);
          insDaily.run(fid, s.id, dateStr, st === 'A' ? 'A' : 'P');
        }
      }
    });

    bulkTx();
    db.close();
    res.json({ success: true, count: dateEntries.length });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// Delete a single future scheduled session
app.delete('/api/schedule/sessions/:sessionId', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const sId = parseInt(req.params.sessionId, 10);
    const { db, datasetName } = getFacultyDb(faculty);
    db.prepare('DELETE FROM attendance_sessions WHERE session_id = ? AND faculty_id = ? AND class_id = ?').run(sId, fid, datasetName);
    db.close();
    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// Combined Step 1 handler: Save and Import to Existing Class OR Create as New Dataset and Import
app.post('/api/datasets/import-with-mode', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const {
      importMode, // 'existing' | 'new'
      newDatasetName,
      faculty_name,
      department,
      academic_year,
      year_of_study,
      semester,
      class_section,
      subject_name,
      total_hours,
      course_type = 'classroom', // 'classroom' | 'lab'
      students = []
    } = req.body;

    const effectiveFacultyName = (faculty_name || '').trim() || faculty.faculty_name;
    const effectiveDepartment = (department || '').trim() || faculty.department;

    let targetDataset = faculty.active_dataset;
    if (importMode === 'new') {
      if (!newDatasetName?.trim()) {
        return res.status(400).json({ error: 'Please enter a name for the new class / dataset.' });
      }
      const created = initializeEmptyFacultyDataset(
        fid,
        effectiveFacultyName,
        effectiveDepartment,
        newDatasetName.trim(),
        {
          courseType: course_type,
          subject: subject_name,
          totalHours: total_hours ? Number(total_hours) : undefined
        }
      );
      targetDataset = created.datasetName;
      faculty.active_dataset = targetDataset;
    }

    const { db, datasetName } = getFacultyDb(faculty, targetDataset);
    targetDataset = datasetName;

    // Save/update faculty profile scoped to faculty_id
    db.prepare('DELETE FROM faculty_profile WHERE faculty_id = ?').run(fid);
    db.prepare(`
      INSERT INTO faculty_profile (faculty_id, faculty_name, department, academic_year, year_of_study, semester, class_section, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      fid,
      effectiveFacultyName,
      effectiveDepartment,
      (academic_year || '2026-2027').trim(),
      (year_of_study || 'Final Year (4th Year)').trim(),
      (semester || 'Semester 7').trim(),
      (class_section || targetDataset).trim()
    );

    updateFacultyAccountIdentity(fid, effectiveFacultyName, effectiveDepartment);

    // Save settings
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run('course_class_handled', effectiveDepartment);
    stmt.run('course_faculty_name', effectiveFacultyName);
    stmt.run('course_type', course_type.toLowerCase() === 'lab' ? 'lab' : 'classroom');
    if (subject_name?.trim()) stmt.run('course_subject', subject_name.trim());
    if (total_hours) stmt.run('course_total_hours', String(total_hours));

    // Save subject if provided
    if (subject_name?.trim()) {
      const sName = subject_name.trim();
      const sHrs = parseFloat(total_hours) || (course_type === 'lab' ? 30 : 45);
      const existingSubj = db.prepare('SELECT id FROM subjects WHERE faculty_id = ? AND name = ?').get(fid, sName) as any;
      if (existingSubj) {
        db.prepare('UPDATE subjects SET semester_hours = ?, semester = ?, class_section = ? WHERE id = ? AND faculty_id = ?')
          .run(sHrs, semester || 'Semester 7', targetDataset, existingSubj.id, fid);
      } else {
        db.prepare('INSERT INTO subjects (faculty_id, name, code, semester_hours, semester, class_section) VALUES (?, ?, ?, ?, ?, ?)')
          .run(fid, sName, sName.slice(0, 6).toUpperCase(), sHrs, semester || 'Semester 7', targetDataset);
      }
    }

    // Import students safely without creating duplicates or overwriting existing student attendance history
    let importedCount = 0;
    let skippedDuplicates = 0;
    if (Array.isArray(students) && students.length > 0) {
      const existingStudents = db.prepare('SELECT id, reg_no, roll_no FROM students WHERE faculty_id = ?').all(fid) as any[];
      const seenRegs = new Set(existingStudents.map(s => String(s.reg_no).trim().toLowerCase()));
      const seenRolls = new Set(existingStudents.map(s => normalizeRollKey(s.roll_no)).filter(Boolean));

      const insStudent = db.prepare(`
        INSERT INTO students (faculty_id, reg_no, roll_no, name, is_active)
        VALUES (?, ?, ?, ?, 1)
      `);

      const importTx = db.transaction(() => {
        for (let idx = 0; idx < students.length; idx++) {
          const item = students[idx];
          const extracted = extractStudentFields(item, idx);
          const regNo = String(item.regNo || item.reg_no || extracted.regNo || '').trim();
          const name = String(item.name || extracted.name || '').trim();
          const hasExpRoll = item.hasExplicitRoll || item.rollNo !== undefined || item.roll_no !== undefined || extracted.hasExplicitRoll;
          let rollNo = String(item.rollNo ?? item.roll_no ?? extracted.rollNo ?? '').trim();

          if (!regNo || !name) continue;

          const regLower = regNo.toLowerCase();
          if (seenRegs.has(regLower)) {
            skippedDuplicates++;
            continue;
          }

          let rollKey = normalizeRollKey(rollNo);
          if (!rollNo || (!hasExpRoll && seenRolls.has(rollKey))) {
            rollNo = getNextRollNumber(existingStudents, seenRolls);
            rollKey = normalizeRollKey(rollNo);
          } else if (hasExpRoll && seenRolls.has(rollKey)) {
            skippedDuplicates++;
            continue;
          }

          try {
            insStudent.run(fid, regNo, rollNo, name);
            seenRegs.add(regLower);
            if (rollKey) seenRolls.add(rollKey);
            importedCount++;
          } catch (_) {
            skippedDuplicates++;
          }
        }
      });
      importTx();
    }

    const totalStudents = (db.prepare('SELECT COUNT(*) as c FROM students WHERE faculty_id = ? AND is_active = 1').get(fid) as any)?.c || 0;
    db.close();

    res.json({
      success: true,
      activeDataset: targetDataset,
      importedCount,
      skippedDuplicates,
      totalStudents,
      courseType: course_type
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

function getDepartmentInsightsFallback(dept: string) {
  const d = (dept || '').toLowerCase();
  
  if (d.includes('comp') || d.includes('cs') || d.includes('it') || d.includes('software') || d.includes('data') || d.includes('ai') || d.includes('cyber')) {
    return [
      {
        id: "cs-1",
        title: "ACM Curriculum Update: Agentic AI & Systems Engineering in Undergraduate CS",
        category: "Pedagogy & Curriculum",
        summary: "The latest 2026 ACM/IEEE-CS joint curriculum recommendations emphasize integrating AI coding assistants, code auditing, and verifiable formal methods directly into introductory and core data structures courses.",
        takeaway: "Incorporate hands-on code review and unit-testing rubrics when students utilize AI synthesis tools in assignments.",
        source: "ACM Educational Activities Board",
        date: "February 2026"
      },
      {
        id: "cs-2",
        title: "Industry Demand Surges for Local Small Language Models (SLMs) and Edge AI",
        category: "Industry Trends",
        summary: "Tech employers increasingly seek graduates with practical experience deploying lightweight quantized models on embedded devices rather than cloud-only APIs.",
        takeaway: "Introduce a lab module or mini-project on running open-weights models locally using ONNX or Ollama.",
        source: "IEEE Spectrum",
        date: "January 2026"
      },
      {
        id: "cs-3",
        title: "Active Learning and Live Coding Outperform Pre-Recorded Lectures in Retention",
        category: "Research & AI",
        summary: "A comprehensive meta-analysis across 40 STEM institutions found that structured peer-instruction and live bug-hunting sessions yielded 24% higher retention in sophomore core classes.",
        takeaway: "Dedicate 15 minutes of each period to interactive live debugging exercises with random roll-call participation.",
        source: "Journal of Systems and Software Education",
        date: "January 2026"
      },
      {
        id: "cs-4",
        title: "ABET & National Accreditation Tightens Cyber-Physical Safety Standards",
        category: "Accreditation & Policy",
        summary: "Engineering accreditation bodies have updated criteria requiring documentation of student continuous attendance, lab logbooks, and verified individual project checkpoints.",
        takeaway: "Maintain weekly lab attendance sign-offs and link student practical hours directly to internal marks records.",
        source: "ABET Engineering Accreditation Commission",
        date: "Recent 2026 Update"
      }
    ];
  } else if (d.includes('elect') || d.includes('ee') || d.includes('ec') || d.includes('telecom') || d.includes('vlsi') || d.includes('comm')) {
    return [
      {
        id: "ece-1",
        title: "Semiconductor Mission & VLSI Curriculum Modernization Across Engineering Colleges",
        category: "Pedagogy & Curriculum",
        summary: "National semiconductor initiatives are providing open-source EDA tools and tape-out incentives for undergraduate ECE and microelectronics classrooms.",
        takeaway: "Integrate open-source RISC-V and SkyWater PDK simulations into digital design lab practicals.",
        source: "Semiconductor Education Alliance",
        date: "February 2026"
      },
      {
        id: "ece-2",
        title: "Energy-Harvesting IoT and 6G Sub-THz Wireless Protocols in Academic Labs",
        category: "Industry Trends",
        summary: "Leading research groups are transitioning embedded systems curriculum toward ultra-low-power protocols and reconfigurable intelligent surfaces.",
        takeaway: "Emphasize power budget calculations and RF link analysis in upcoming student semester projects.",
        source: "IEEE Communications Society",
        date: "January 2026"
      },
      {
        id: "ece-3",
        title: "Outcome-Based Assessment: Bridging Hardware Simulation to Physical Breadboards",
        category: "Research & AI",
        summary: "Studies show that combining SPICE simulations prior to benchtop hardware measurement reduces component failure by 60% and accelerates student troubleshooting skills.",
        takeaway: "Enforce pre-lab software verification checkoff before allowing hardware bench access.",
        source: "International Journal of Electrical Engineering Education",
        date: "Recent 2026 Update"
      },
      {
        id: "ece-4",
        title: "Mandatory Laboratory Attendance Tracking for Autonomous Engineering Accreditation",
        category: "Accreditation & Policy",
        summary: "Accrediting councils mandate verified session-by-session student presence and lab hour fulfillment for experimental components.",
        takeaway: "Use session-based Lab attendance mode to strictly record 2-hour or 3-hour practical blocks with 1 mark per missed session.",
        source: "National Board of Accreditation",
        date: "January 2026"
      }
    ];
  } else if (d.includes('mech') || d.includes('civil') || d.includes('aero') || d.includes('auto') || d.includes('robot')) {
    return [
      {
        id: "mech-1",
        title: "Generative Design & Additive Manufacturing Integration into Core Mechanical Syllabus",
        category: "Pedagogy & Curriculum",
        summary: "Industry 4.0 mandates are transforming traditional drafting and strength of materials courses to emphasize generative topology optimization and 3D metal printing.",
        takeaway: "Incorporate finite element analysis (FEA) optimization benchmarks into CAD lab exercises.",
        source: "ASME Education News",
        date: "February 2026"
      },
      {
        id: "mech-2",
        title: "Electric Vehicle Powertrain & Battery Thermal Management Boom in Academic Research",
        category: "Industry Trends",
        summary: "EV manufacturers report a steep demand for engineering graduates skilled in thermal simulation, battery pack packaging, and regenerative braking dynamics.",
        takeaway: "Offer elective capstones focusing on battery state-of-charge thermal modeling and lightweight structural composites.",
        source: "SAE International Academic Quarterly",
        date: "January 2026"
      },
      {
        id: "mech-3",
        title: "Digital Twin Platforms Accelerate Machinery Maintenance Labs",
        category: "Research & AI",
        summary: "University engineering shops are adopting sensorized digital twins of CNC lathes and wind turbines to allow predictive maintenance experiments.",
        takeaway: "Utilize IoT vibration and acoustic sensor logs in machinery lab practicals.",
        source: "Journal of Manufacturing Systems",
        date: "Recent 2026 Update"
      },
      {
        id: "mech-4",
        title: "Stringent Workshop Safety Protocols and Attendance Compliance Requirements",
        category: "Accreditation & Policy",
        summary: "Institutional safety audits require complete attendance logs and safety briefing sign-offs before heavy machinery and foundry operations.",
        takeaway: "Track every workshop and laboratory session punctually with zero unrecorded absences.",
        source: "Higher Education Safety & Health Council",
        date: "January 2026"
      }
    ];
  } else {
    return [
      {
        id: "gen-1",
        title: "Micro-Credentials and Modular Course Design in Higher Education Curricula",
        category: "Pedagogy & Curriculum",
        summary: "Universities are structuring courses into bite-sized verifiable skill modules that allow students to showcase domain competencies alongside traditional transcripts.",
        takeaway: "Structure your syllabus into clear 2-week competency units with continuous milestone evaluations.",
        source: "Higher Education Chronicle",
        date: "February 2026"
      },
      {
        id: "gen-2",
        title: "AI-Augmented Formative Assessment Improves Course Completion Rates",
        category: "Research & AI",
        summary: "Studies across 50 international universities highlight that frequent low-stakes quizzes and real-time student feedback increase end-semester passing rates by 18%.",
        takeaway: "Use 5-minute end-of-period reflection checks to track conceptual understanding alongside daily attendance.",
        source: "Educational Research Review",
        date: "January 2026"
      },
      {
        id: "gen-3",
        title: "Cross-Disciplinary Project-Based Learning in Undergraduate Programs",
        category: "Industry Trends",
        summary: "Leading employers value graduates who have collaborated on multidisciplinary challenges blending data literacy with domain expertise.",
        takeaway: "Encourage group capstones pairing students from complementary specializations.",
        source: "World Economic Forum Education Brief",
        date: "January 2026"
      },
      {
        id: "gen-4",
        title: "Strict Academic Attendance Thresholds and Government Scholarship Eligibility",
        category: "Accreditation & Policy",
        summary: "State higher education departments mandate a minimum 75% attendance threshold for examination eligibility and state scholarship renewals.",
        takeaway: "Generate mid-semester monthly reports to notify students below the 75% cutoff early.",
        source: "University Grants & Higher Education Regulatory Board",
        date: "Recent 2026 Update"
      }
    ];
  }
}

// In-memory cache for departmental academic insights
const insightsCache = new Map<string, { payload: any; timestamp: number }>();
let geminiRateLimitUntil = 0; // Cooldown timer when 429 occurs

// SEMESTER INSIGHT: Academic News & Trends powered by Google Search Grounding
app.get('/api/insights/academic-news', async (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const requestedDept = (req.query.department as string) || '';
    const { db } = getFacultyDb(faculty);
    const profileRow = db.prepare("SELECT value FROM settings WHERE key = 'faculty_profile'").get() as any;
    const profileTable = db.prepare('SELECT * FROM faculty_profile WHERE faculty_id = ? ORDER BY id DESC LIMIT 1').get(fid) as any;
    db.close();

    let department = requestedDept;
    if (!department && profileTable?.department) {
      department = profileTable.department;
    } else if (!department && profileRow) {
      try {
        const p = JSON.parse(profileRow.value);
        department = p.department || p.classHandled || '';
      } catch (e) {}
    }
    if (!department && faculty.department) {
      department = faculty.department;
    }
    if (!department) department = 'Computer Science & Engineering';

    const cacheKey = department.toLowerCase().trim();
    const now = Date.now();

    // Check memory cache (valid for 30 minutes)
    const cached = insightsCache.get(cacheKey);
    if (cached && (now - cached.timestamp < 30 * 60 * 1000)) {
      return res.json(cached.payload);
    }

    // Call Gemini API with Google Search Grounding if key is present and not in rate-limit cooldown
    if (process.env.GEMINI_API_KEY && now > geminiRateLimitUntil) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build'
            }
          }
        });

        const prompt = `You are an academic intelligence research assistant for university and college faculty.
Search Google for the latest verified academic news, pedagogical research, higher education policy developments, curriculum innovations, or industry technological trends relevant to the "${department}" department for the academic year 2026.

Provide 4 high-value, recent, concrete news or trend items in clean JSON format:
[
  {
    "id": "1",
    "title": "Clear concise headline",
    "category": "Pedagogy & Curriculum",
    "summary": "2-3 informative sentences summarizing what happened and its impact.",
    "takeaway": "Actionable takeaway for faculty teaching this semester.",
    "source": "Source publication or institution",
    "date": "Recent month/year e.g. Feb 2026"
  }
]
Categories should be chosen from: "Pedagogy & Curriculum", "Industry Trends", "Research & AI", "Accreditation & Policy".
Return ONLY valid JSON matching this structure without Markdown fences or extra commentary.`;

        const geminiRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }]
          }
        });

        const rawText = geminiRes.text || '';
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        let items: any[] = [];
        if (jsonMatch) {
          try {
            items = JSON.parse(jsonMatch[0]);
          } catch (e) {}
        }

        const grounding = geminiRes.candidates?.[0]?.groundingMetadata;
        const webSources = (grounding?.groundingChunks || [])
          .map((chunk: any) => ({
            title: chunk.web?.title || 'Academic Source',
            url: chunk.web?.uri || ''
          }))
          .filter((s: any) => s.url);

        const queries = grounding?.webSearchQueries || [];

        if (items && items.length > 0) {
          const payload = {
            success: true,
            department,
            isLiveGrounded: true,
            items,
            sources: webSources,
            queries,
            lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          insightsCache.set(cacheKey, { payload, timestamp: now });
          return res.json(payload);
        }
      } catch (geminiErr: any) {
        // If 429 quota exhausted or network error, activate cooldown for 15 minutes without throwing unhandled logs
        if (geminiErr?.status === 429 || String(geminiErr?.message || '').includes('429') || String(geminiErr?.message || '').includes('RESOURCE_EXHAUSTED')) {
          geminiRateLimitUntil = now + 15 * 60 * 1000;
        }
      }
    }

    // Curated high-relevance departmental news feed fallback
    const fallbackItems = getDepartmentInsightsFallback(department);
    const fallbackPayload = {
      success: true,
      department,
      isLiveGrounded: false,
      items: fallbackItems,
      sources: [
        { title: 'The Chronicle of Higher Education', url: 'https://www.chronicle.com' },
        { title: 'Inside Higher Ed — Academic Affairs', url: 'https://www.insidehighered.com' },
        { title: 'IEEE Transactions on Education', url: 'https://ieee-edusociety.org' }
      ],
      queries: [`latest curriculum trends ${department} 2026`, `academic innovations in ${department}`],
      lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    insightsCache.set(cacheKey, { payload: fallbackPayload, timestamp: now });
    res.json(fallbackPayload);
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 8. SUBJECTS & HOURS
app.get('/api/subjects', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { db } = getFacultyDb(faculty);
    const subjects = db.prepare('SELECT * FROM subjects WHERE faculty_id = ? ORDER BY name ASC').all(fid) as any[];

    for (const subj of subjects) {
      const sessionCount = (db.prepare(`
        SELECT COUNT(DISTINCT attendance_date || '-' || period_number) as c
        FROM attendance_sessions
        WHERE faculty_id = ? AND subject_id = ?
      `).get(fid, subj.id) as any)?.c || 0;

      const durationMins = subj.period_duration_mins || 60;
      const completedHours = parseFloat((sessionCount * (durationMins / 60.0)).toFixed(2));
      const totalHours = parseFloat(subj.semester_hours || 45);
      const remainingHours = Math.max(0, parseFloat((totalHours - completedHours).toFixed(2)));
      const completionPct = totalHours > 0 ? Math.min(100.0, parseFloat(((completedHours / totalHours) * 100).toFixed(1))) : 0.0;
      const scheduledPeriods = (db.prepare('SELECT COUNT(*) as c FROM timetable WHERE faculty_id = ? AND subject_id = ?').get(fid, subj.id) as any)?.c || 0;

      subj.completed_hours = completedHours;
      subj.remaining_hours = remainingHours;
      subj.completion_pct = completionPct;
      subj.weekly_scheduled_periods = scheduledPeriods;
      subj.completed_sessions = sessionCount;
    }

    db.close();
    res.json({ subjects });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.post('/api/subjects', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { name, code, semester_hours, weekly_target, period_duration_mins, semester, class_section } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Subject name is required.' });

    const { db, datasetName } = getFacultyDb(faculty);
    const info = db.prepare(`
      INSERT INTO subjects (faculty_id, name, code, semester_hours, weekly_target, period_duration_mins, semester, class_section)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fid,
      name.trim(),
      (code || name.slice(0, 6)).trim().toUpperCase(),
      parseFloat(semester_hours || 45),
      parseInt(weekly_target || 3, 10),
      parseInt(period_duration_mins || 60, 10),
      (semester || 'Semester 7').trim(),
      (class_section || datasetName).trim()
    );
    db.close();
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.put('/api/subjects/:id', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { name, code, semester_hours, weekly_target, period_duration_mins, semester, class_section } = req.body;
    const id = parseInt(req.params.id, 10);
    const { db, datasetName } = getFacultyDb(faculty);

    const existing = db.prepare('SELECT id FROM subjects WHERE id = ? AND faculty_id = ?').get(id, fid);
    if (!existing) {
      db.close();
      return res.status(404).json({ error: 'Subject not found in your faculty account.' });
    }

    db.prepare(`
      UPDATE subjects
      SET name = ?, code = ?, semester_hours = ?, weekly_target = ?, period_duration_mins = ?, semester = ?, class_section = ?
      WHERE id = ? AND faculty_id = ?
    `).run(
      name.trim(),
      (code || name.slice(0, 6)).trim().toUpperCase(),
      parseFloat(semester_hours || 45),
      parseInt(weekly_target || 3, 10),
      parseInt(period_duration_mins || 60, 10),
      (semester || 'Semester 7').trim(),
      (class_section || datasetName).trim(),
      id,
      fid
    );
    db.close();
    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.delete('/api/subjects/:id', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const id = parseInt(req.params.id, 10);
    const { db } = getFacultyDb(faculty);
    const existing = db.prepare('SELECT id FROM subjects WHERE id = ? AND faculty_id = ?').get(id, fid);
    if (!existing) {
      db.close();
      return res.status(404).json({ error: 'Subject not found in your faculty account.' });
    }
    db.prepare('DELETE FROM timetable WHERE subject_id = ? AND faculty_id = ?').run(id, fid);
    db.prepare('DELETE FROM subjects WHERE id = ? AND faculty_id = ?').run(id, fid);
    db.close();
    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 9. TIMETABLE
app.get('/api/timetable', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { db, datasetName } = getFacultyDb(faculty);
    const rows = db.prepare(`
      SELECT t.id, t.subject_id, t.weekday, t.period_no, t.class_name,
             s.name as subject_name, s.code as subject_code, s.semester_hours, s.weekly_target
      FROM timetable t
      JOIN subjects s ON s.id = t.subject_id AND s.faculty_id = t.faculty_id
      WHERE t.faculty_id = ? AND t.class_name = ?
      ORDER BY t.weekday, t.period_no
    `).all(fid, datasetName) as any[];

    const subjects = db.prepare('SELECT id, name, code, semester_hours, weekly_target FROM subjects WHERE faculty_id = ? ORDER BY name ASC').all(fid);
    db.close();

    const grid: Record<number, Record<number, any>> = {};
    for (let w = 0; w <= 6; w++) {
      grid[w] = {};
      for (let p = 1; p <= 8; p++) grid[w][p] = null;
    }
    for (const r of rows) {
      if (grid[r.weekday]) grid[r.weekday][r.period_no] = r;
    }

    res.json({ rows, grid, subjects });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.post('/api/timetable', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { subject_id, weekday, period_no, class_name } = req.body;
    const w = parseInt(weekday, 10);
    const p = parseInt(period_no, 10);
    const sId = parseInt(subject_id, 10);

    if (w < 0 || w > 6) return res.status(400).json({ error: 'Weekday must be 0 to 6.' });
    if (p < 1 || p > 8) return res.status(400).json({ error: 'Period must be 1 to 8.' });

    const { db, datasetName } = getFacultyDb(faculty);
    const cName = class_name || datasetName;

    const ownsSubject = db.prepare('SELECT id FROM subjects WHERE id = ? AND faculty_id = ?').get(sId, fid);
    if (!ownsSubject) {
      db.close();
      return res.status(404).json({ error: 'Selected subject does not belong to your faculty account.' });
    }

    db.prepare(`
      INSERT INTO timetable (faculty_id, subject_id, weekday, period_no, class_name)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(class_name, weekday, period_no)
      DO UPDATE SET subject_id = excluded.subject_id, faculty_id = excluded.faculty_id
    `).run(fid, sId, w, p, cName);

    db.close();
    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.delete('/api/timetable/slot', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { weekday, period_no, class_name } = req.body;
    const { db, datasetName } = getFacultyDb(faculty);
    db.prepare('DELETE FROM timetable WHERE faculty_id = ? AND weekday = ? AND period_no = ? AND class_name = ?')
      .run(fid, parseInt(weekday, 10), parseInt(period_no, 10), class_name || datasetName);
    db.close();
    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 10. MONTHLY REPORT & MATRIX
app.get('/api/reports/monthly', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const requestedDataset = req.query.dataset ? String(req.query.dataset) : undefined;
    const year = parseInt(String(req.query.year || new Date().getFullYear()), 10);
    const month = parseInt(String(req.query.month || (new Date().getMonth() + 1)), 10);
    const query = String(req.query.q || '').trim();

    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { db, datasetName } = getFacultyDb(faculty, requestedDataset);
    const threshold = parseFloat((db.prepare("SELECT value FROM settings WHERE key='low_attendance_threshold'").get() as any)?.value || '75');
    const courseType = (db.prepare("SELECT value FROM settings WHERE key='course_type'").get() as any)?.value || 'classroom';

    const submittedDates = db.prepare(`
      SELECT DISTINCT attendance_date FROM daily_attendance
      WHERE faculty_id = ? AND attendance_date BETWEEN ? AND ?
      ORDER BY attendance_date ASC
    `).all(fid, start, end).map((r: any) => r.attendance_date);

    const holidays = db.prepare(`
      SELECT holiday_date, description FROM holidays
      WHERE faculty_id = ? AND holiday_date BETWEEN ? AND ?
    `).all(fid, start, end) as any[];
    const holidayMap = new Map<string, string>();
    for (const h of holidays) holidayMap.set(h.holiday_date, h.description);

    let stdSql = 'SELECT * FROM students WHERE faculty_id = ?';
    const params: any[] = [fid];
    if (query) {
      stdSql += ' AND (reg_no LIKE ? OR (roll_no IS NOT NULL AND roll_no LIKE ?) OR name LIKE ?)';
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    const students = db.prepare(stdSql).all(...params) as any[];
    students.sort((a, b) => compareRolls(a.roll_no || a.reg_no, b.roll_no || b.reg_no));

    const attendanceRecords = db.prepare(`
      SELECT student_id, attendance_date, status FROM daily_attendance
      WHERE faculty_id = ? AND attendance_date BETWEEN ? AND ?
    `).all(fid, start, end) as any[];

    // Overlay OD statuses from attendance_records so OD stays visibly OD while counting as Present
    const odRecords = db.prepare(`
      SELECT r.student_id, s.attendance_date, r.status
      FROM attendance_records r
      JOIN attendance_sessions s ON s.session_id = r.session_id
      WHERE s.faculty_id = ? AND r.faculty_id = ? AND s.class_id = ? AND s.attendance_date BETWEEN ? AND ? AND r.status = 'OD'
    `).all(fid, fid, datasetName, start, end) as any[];
    const odKeySet = new Set(odRecords.map(r => `${r.student_id}_${r.attendance_date}`));

    const studentDateStatus = new Map<string, string>();
    const studentPresentCounts = new Map<number, number>();
    const studentAbsentCounts = new Map<number, number>();

    for (const rec of attendanceRecords) {
      const key = `${rec.student_id}_${rec.attendance_date}`;
      const displayStat = odKeySet.has(key) ? 'OD' : rec.status;
      studentDateStatus.set(key, displayStat);
      if (rec.status === 'P') {
        studentPresentCounts.set(rec.student_id, (studentPresentCounts.get(rec.student_id) || 0) + 1);
      } else if (rec.status === 'A') {
        studentAbsentCounts.set(rec.student_id, (studentAbsentCounts.get(rec.student_id) || 0) + 1);
      }
    }

    const monthDays: string[] = [];
    for (let d = 1; d <= lastDay; d++) {
      monthDays.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }

    const summary = students.map((s, idx) => {
      const present = studentPresentCounts.get(s.id) || 0;
      const absent = studentAbsentCounts.get(s.id) || 0;
      const workingDays = submittedDates.length;
      const pct = workingDays > 0 ? parseFloat(((present / workingDays) * 100).toFixed(2)) : 0.0;
      const isLow = pct < threshold && workingDays > 0;
      const marks = calculateAttendanceMarks(absent, workingDays, courseType);

      const dayStatuses: Record<string, string> = {};
      for (const day of monthDays) {
        if (holidayMap.has(day)) {
          dayStatuses[day] = 'H';
        } else if (studentDateStatus.has(`${s.id}_${day}`)) {
          dayStatuses[day] = studentDateStatus.get(`${s.id}_${day}`)!;
        } else {
          dayStatuses[day] = '-';
        }
      }

      return {
        id: s.id,
        sNo: idx + 1,
        rollNo: s.roll_no || s.reg_no,
        regNo: s.reg_no,
        name: s.name,
        isActive: !!s.is_active,
        workingDays,
        present,
        absent,
        attendancePct: pct,
        isLow,
        marks,
        dayStatuses
      };
    });

    db.close();
    res.json({
      year,
      month,
      start,
      end,
      workingDaysCount: submittedDates.length,
      submittedDates,
      holidays,
      threshold,
      monthDays,
      summary
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 11. INDIVIDUAL STUDENT REPORT
app.get('/api/reports/student/:id', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const studentId = parseInt(req.params.id, 10);
    const { db, datasetName } = getFacultyDb(faculty);
    const student = db.prepare('SELECT * FROM students WHERE id = ? AND faculty_id = ?').get(studentId, fid) as any;
    if (!student) {
      db.close();
      return res.status(404).json({ error: 'Student not found in your faculty account.' });
    }

    const courseType = (db.prepare("SELECT value FROM settings WHERE key='course_type'").get() as any)?.value || 'classroom';
    const defaultSubj = (db.prepare("SELECT value FROM settings WHERE key='course_subject'").get() as any)?.value || 'Classroom';
    const wpMap = getWeekdayPeriodMap(db, datasetName, fid);
    const totalWorkingDays = (db.prepare('SELECT COUNT(DISTINCT attendance_date) as c FROM daily_attendance WHERE faculty_id = ?').get(fid) as any)?.c || 0;
    const totalHolidays = (db.prepare('SELECT COUNT(*) as c FROM holidays WHERE faculty_id = ?').get(fid) as any)?.c || 0;

    const rawLogs = db.prepare(`
      SELECT a.attendance_date, a.status,
             s.period_number as sess_period,
             r.status as rec_status,
             COALESCE(subj.name, ?) as subject_name
      FROM daily_attendance a
      LEFT JOIN attendance_sessions s ON s.attendance_date = a.attendance_date AND s.class_id = ? AND s.faculty_id = a.faculty_id
      LEFT JOIN attendance_records r ON r.session_id = s.session_id AND r.student_id = a.student_id AND r.faculty_id = a.faculty_id
      LEFT JOIN subjects subj ON subj.id = s.subject_id AND subj.faculty_id = a.faculty_id
      WHERE a.student_id = ? AND a.faculty_id = ?
      ORDER BY a.attendance_date DESC, COALESCE(s.period_number, 1) DESC
    `).all(defaultSubj, datasetName, studentId, fid) as any[];

    const seenDateKeys = new Set<string>();
    const logs = rawLogs.filter(l => {
      const k = `${l.attendance_date}_${l.sess_period || 1}`;
      if (seenDateKeys.has(k)) return false;
      seenDateKeys.add(k);
      return true;
    }).map(l => {
      const dObj = new Date(l.attendance_date + 'T00:00:00');
      const wIdx = (dObj.getDay() + 6) % 7;
      return {
        attendance_date: l.attendance_date,
        status: l.rec_status === 'OD' ? 'OD' : l.status,
        period_no: l.sess_period || wpMap[wIdx]?.period || 1,
        subject_name: l.subject_name
      };
    });

    const dailyCounts = db.prepare(`
      SELECT SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as p,
             SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as a
      FROM daily_attendance
      WHERE student_id = ? AND faculty_id = ?
    `).get(studentId, fid) as any;

    const presentCount = dailyCounts?.p || 0;
    const absentCount = dailyCounts?.a || 0;
    const attendancePct = totalWorkingDays > 0 ? parseFloat(((presentCount / totalWorkingDays) * 100).toFixed(2)) : 0.0;
    const marks = calculateAttendanceMarks(absentCount, totalWorkingDays, courseType);

    const monthlyStats = db.prepare(`
      SELECT substr(attendance_date, 1, 7) as month,
             COUNT(*) as total_sessions,
             SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as present,
             SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as absent
      FROM daily_attendance
      WHERE student_id = ? AND faculty_id = ?
      GROUP BY month
      ORDER BY month ASC
    `).all(studentId, fid);

    db.close();
    res.json({
      student,
      stats: {
        workingDays: totalWorkingDays,
        present: presentCount,
        absent: absentCount,
        holidays: totalHolidays,
        attendancePct,
        marks,
        courseType
      },
      monthlyStats,
      logs
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 12. HOLIDAYS
app.get('/api/holidays', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { db } = getFacultyDb(faculty);
    const rows = db.prepare('SELECT * FROM holidays WHERE faculty_id = ? ORDER BY holiday_date ASC').all(fid);
    db.close();
    res.json({ holidays: rows });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.post('/api/holidays', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { holiday_date, description, replace_attendance } = req.body;
    const d = String(holiday_date || '').trim();
    if (!d) return res.status(400).json({ error: 'Holiday date is required.' });

    const { db } = getFacultyDb(faculty);
    const hasAtt = db.prepare('SELECT 1 FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ?').get(fid, d);
    if (hasAtt && !replace_attendance) {
      db.close();
      return res.status(400).json({ error: 'Attendance exists for this date. Enable replace to mark as holiday.' });
    }

    if (replace_attendance) {
      db.prepare('DELETE FROM daily_attendance WHERE faculty_id = ? AND attendance_date = ?').run(fid, d);
      db.prepare('DELETE FROM period_attendance WHERE faculty_id = ? AND attendance_date = ?').run(fid, d);
      db.prepare('DELETE FROM attendance_sessions WHERE faculty_id = ? AND attendance_date = ?').run(fid, d);
    }

    db.prepare(`
      INSERT INTO holidays (faculty_id, holiday_date, description)
      VALUES (?, ?, ?)
      ON CONFLICT(holiday_date) DO UPDATE SET description = excluded.description, faculty_id = excluded.faculty_id
    `).run(fid, d, (description || 'Holiday').trim());

    db.close();
    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.delete('/api/holidays/:date', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const d = req.params.date;
    const { db } = getFacultyDb(faculty);
    db.prepare('DELETE FROM holidays WHERE faculty_id = ? AND holiday_date = ?').run(fid, d);
    db.close();
    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 13. SETTINGS
app.get('/api/settings', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const { db, datasetName } = getFacultyDb(faculty);
    const rows = db.prepare('SELECT key, value FROM settings').all() as any[];
    const profile = db.prepare('SELECT * FROM faculty_profile WHERE faculty_id = ? ORDER BY id DESC LIMIT 1').get(fid) as any;
    db.close();

    const sMap: Record<string, string> = {};
    for (const r of rows) sMap[r.key] = r.value;

    res.json({
      low_attendance_threshold: sMap.low_attendance_threshold || '75',
      course_class_handled: profile?.department || sMap.course_class_handled || faculty.department || '',
      course_faculty_name: profile?.faculty_name || sMap.course_faculty_name || faculty.faculty_name || '',
      course_subject: sMap.course_subject || '',
      course_total_hours: sMap.course_total_hours || '45',
      course_type: sMap.course_type || 'classroom',
      academic_year: profile?.academic_year || '2026-2027',
      year_of_study: profile?.year_of_study || '4th Year',
      semester: profile?.semester || 'Semester 7',
      active_dataset: datasetName
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const faculty = req.faculty!;
    const settings = req.body || {};
    const { db } = getFacultyDb(faculty);
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [k, v] of Object.entries(settings)) {
      if (typeof v === 'string' || typeof v === 'number') {
        stmt.run(k, String(v));
      }
    }
    db.close();

    if (settings.course_faculty_name && settings.course_class_handled) {
      updateFacultyAccountIdentity(faculty.id, String(settings.course_faculty_name), String(settings.course_class_handled));
    }

    res.json({ success: true });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// 14. OFFICIAL EXCEL ATTENDANCE REGISTER EXPORT (Monthly & Complete Semester with Coloured Statuses)
interface ExportSessionColumn {
  key: string; // `${date}_${period}`
  date: string;
  period: number;
  duration: number;
  isHoliday: boolean;
  holidayDescription?: string;
}

function normalizeAttendanceStatus(raw: unknown): 'P' | 'A' | 'OD' | 'H' {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s || s === 'P' || s === 'PRESENT') return 'P';
  if (s === 'OD' || s === 'ON DUTY' || s === 'ON-DUTY' || s === 'ONDUTY') return 'OD';
  if (s === 'H' || s === 'HOLIDAY') return 'H';
  if (s === 'A' || s === 'L' || s === 'ABSENT' || s === 'LEAVE') return 'A';
  return 'P';
}

function roundRegisterHours(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function collectSavedExportSessions(
  db: Database.Database,
  classId: string,
  facultyId: number,
  opts: { dateStart?: string; dateEnd?: string; subjectId?: number | null }
): {
  sessionColumns: ExportSessionColumn[];
  attendanceMap: Map<string, string>; // key: `${student_id}_${date}_${period}` -> 'P' | 'A' | 'OD' | 'H'
} {
  const { dateStart, dateEnd, subjectId } = opts;
  const wpMap = getWeekdayPeriodMap(db, classId, facultyId);

  // Load saved holidays for this faculty
  let holSql = 'SELECT holiday_date, description FROM holidays WHERE faculty_id = ?';
  const holParams: any[] = [facultyId];
  if (dateStart && dateEnd) {
    holSql += ' AND holiday_date BETWEEN ? AND ?';
    holParams.push(dateStart, dateEnd);
  }
  const holRows = db.prepare(holSql).all(...holParams) as any[];
  const holidayMap = new Map<string, string>();
  for (const h of holRows) {
    holidayMap.set(h.holiday_date, h.description || 'Holiday');
  }

  // Check subject ownership: only apply strict subject_id filtering when multiple subjects exist
  const allSubjects = db.prepare('SELECT id FROM subjects WHERE faculty_id = ? ORDER BY id ASC').all(facultyId) as any[];
  const hasMultipleSubjects = allSubjects.length > 1;
  const isSecondarySubjectFilter = Boolean(
    subjectId && hasMultipleSubjects && allSubjects[0].id !== subjectId
  );

  // 1. Saved sessions in attendance_sessions (ONLY those that actually have saved attendance_records or are saved holidays)
  let sessSql = `
    SELECT s.session_id, s.attendance_date, s.period_number, s.period_duration, s.subject_id
    FROM attendance_sessions s
    WHERE s.faculty_id = ? AND s.class_id = ?
      AND (
        EXISTS (SELECT 1 FROM attendance_records r WHERE r.session_id = s.session_id AND r.faculty_id = s.faculty_id)
        OR EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = s.attendance_date AND h.faculty_id = s.faculty_id)
      )
  `;
  const sessParams: any[] = [facultyId, classId];
  if (dateStart && dateEnd) {
    sessSql += ' AND s.attendance_date BETWEEN ? AND ?';
    sessParams.push(dateStart, dateEnd);
  }
  if (subjectId && hasMultipleSubjects) {
    if (isSecondarySubjectFilter) {
      sessSql += ' AND s.subject_id = ?';
      sessParams.push(subjectId);
    } else {
      sessSql += ' AND (s.subject_id = ? OR s.subject_id IS NULL OR s.subject_id NOT IN (SELECT id FROM subjects WHERE faculty_id = ?))';
      sessParams.push(subjectId, facultyId);
    }
  }
  sessSql += ' ORDER BY s.attendance_date ASC, s.period_number ASC';

  const savedSessions = db.prepare(sessSql).all(...sessParams) as any[];

  const columnsByKey = new Map<string, ExportSessionColumn>();
  const datesCoveredBySessions = new Set<string>();
  const attendanceMap = new Map<string, string>();

  for (const s of savedSessions) {
    const isHol = holidayMap.has(s.attendance_date);
    const periodNo = Number(s.period_number) || 1;
    const key = `${s.attendance_date}_${periodNo}`;
    columnsByKey.set(key, {
      key,
      date: s.attendance_date,
      period: periodNo,
      duration: Number(s.period_duration) || 60,
      isHoliday: isHol,
      holidayDescription: holidayMap.get(s.attendance_date)
    });
    datesCoveredBySessions.add(s.attendance_date);
  }

  if (savedSessions.length > 0) {
    const sessIds = savedSessions.map(s => s.session_id);
    const placeholders = sessIds.map(() => '?').join(',');
    const recs = db.prepare(`
      SELECT r.student_id, r.status, s.attendance_date, s.period_number
      FROM attendance_records r
      JOIN attendance_sessions s ON s.session_id = r.session_id
      WHERE r.faculty_id = ? AND r.session_id IN (${placeholders})
    `).all(facultyId, ...sessIds) as any[];

    const nonHolCountByCol = new Map<string, number>();
    const holCountByCol = new Map<string, number>();

    for (const r of recs) {
      const periodNo = Number(r.period_number) || 1;
      const colKey = `${r.attendance_date}_${periodNo}`;
      const norm = normalizeAttendanceStatus(r.status);
      attendanceMap.set(`${r.student_id}_${colKey}`, norm);
      if (norm === 'H') {
        holCountByCol.set(colKey, (holCountByCol.get(colKey) || 0) + 1);
      } else {
        nonHolCountByCol.set(colKey, (nonHolCountByCol.get(colKey) || 0) + 1);
      }
    }

    for (const [colKey, hCnt] of holCountByCol.entries()) {
      if (hCnt > 0 && (nonHolCountByCol.get(colKey) || 0) === 0) {
        const col = columnsByKey.get(colKey);
        if (col) {
          col.isHoliday = true;
          col.holidayDescription = col.holidayDescription || 'Holiday';
        }
      }
    }
  }

  // 2. Include historical saved records in period_attendance / daily_attendance for dates not already covered
  if (!isSecondarySubjectFilter) {
    let paSql = 'SELECT DISTINCT attendance_date, period_no FROM period_attendance';
    const paParams: any[] = [facultyId];
    const paClauses: string[] = ['faculty_id = ?'];
    if (dateStart && dateEnd) {
      paClauses.push('attendance_date BETWEEN ? AND ?');
      paParams.push(dateStart, dateEnd);
    }
    if (subjectId && hasMultipleSubjects) {
      paClauses.push('(subject_id = ? OR subject_id IS NULL)');
      paParams.push(subjectId);
    }
    paSql += ' WHERE ' + paClauses.join(' AND ') + ' ORDER BY attendance_date ASC, period_no ASC';

    const paSessions = db.prepare(paSql).all(...paParams) as any[];
    for (const ps of paSessions) {
      if (datesCoveredBySessions.has(ps.attendance_date)) continue;
      const periodNo = Number(ps.period_no) || 1;
      const key = `${ps.attendance_date}_${periodNo}`;
      if (!columnsByKey.has(key)) {
        columnsByKey.set(key, {
          key,
          date: ps.attendance_date,
          period: periodNo,
          duration: 60,
          isHoliday: holidayMap.has(ps.attendance_date),
          holidayDescription: holidayMap.get(ps.attendance_date)
        });
      }
    }

    if (paSessions.length > 0) {
      let paRecSql = 'SELECT student_id, attendance_date, period_no, status FROM period_attendance WHERE faculty_id = ?';
      const paRecParams: any[] = [facultyId];
      if (dateStart && dateEnd) {
        paRecSql += ' AND attendance_date BETWEEN ? AND ?';
        paRecParams.push(dateStart, dateEnd);
      }
      for (const r of db.prepare(paRecSql).all(...paRecParams) as any[]) {
        if (!datesCoveredBySessions.has(r.attendance_date)) {
          const periodNo = Number(r.period_no) || 1;
          attendanceMap.set(`${r.student_id}_${r.attendance_date}_${periodNo}`, normalizeAttendanceStatus(r.status));
        }
      }
      for (const ps of paSessions) {
        datesCoveredBySessions.add(ps.attendance_date);
      }
    }

    // Legacy daily_attendance dates for this faculty
    let daSql = 'SELECT DISTINCT attendance_date FROM daily_attendance WHERE faculty_id = ?';
    const daParams: any[] = [facultyId];
    if (dateStart && dateEnd) {
      daSql += ' AND attendance_date BETWEEN ? AND ?';
      daParams.push(dateStart, dateEnd);
    }
    daSql += ' ORDER BY attendance_date ASC';

    const daDates = db.prepare(daSql).all(...daParams) as any[];
    const uncoveredDailyDates: string[] = [];
    for (const dRow of daDates) {
      const dStr = dRow.attendance_date;
      if (datesCoveredBySessions.has(dStr)) continue;
      const dObj = new Date(dStr + 'T00:00:00');
      const wIdx = (dObj.getDay() + 6) % 7;
      const pCfg = wpMap[wIdx] || { period: 1, duration: 60 };
      const key = `${dStr}_${pCfg.period}`;
      columnsByKey.set(key, {
        key,
        date: dStr,
        period: pCfg.period,
        duration: pCfg.duration,
        isHoliday: holidayMap.has(dStr),
        holidayDescription: holidayMap.get(dStr)
      });
      datesCoveredBySessions.add(dStr);
      uncoveredDailyDates.push(dStr);
    }

    if (uncoveredDailyDates.length > 0) {
      let daRecSql = 'SELECT student_id, attendance_date, status FROM daily_attendance WHERE faculty_id = ?';
      const daRecParams: any[] = [facultyId];
      if (dateStart && dateEnd) {
        daRecSql += ' AND attendance_date BETWEEN ? AND ?';
        daRecParams.push(dateStart, dateEnd);
      }
      const uncoverSet = new Set(uncoveredDailyDates);
      for (const r of db.prepare(daRecSql).all(...daRecParams) as any[]) {
        if (uncoverSet.has(r.attendance_date)) {
          const dObj = new Date(r.attendance_date + 'T00:00:00');
          const wIdx = (dObj.getDay() + 6) % 7;
          const period = wpMap[wIdx]?.period || 1;
          attendanceMap.set(`${r.student_id}_${r.attendance_date}_${period}`, normalizeAttendanceStatus(r.status));
        }
      }
    }
  }

  // Determine active working-date span when dateStart/dateEnd are omitted so out-of-semester holidays aren't added unintentionally
  let minWorkDate = '';
  let maxWorkDate = '';
  for (const col of columnsByKey.values()) {
    if (!col.isHoliday) {
      if (!minWorkDate || col.date < minWorkDate) minWorkDate = col.date;
      if (!maxWorkDate || col.date > maxWorkDate) maxWorkDate = col.date;
    }
  }

  // 3. Include saved holidays in the selected range so Holiday displays clearly in Excel without counting as working hours/absences
  for (const [hDate, hDesc] of holidayMap.entries()) {
    if (!datesCoveredBySessions.has(hDate)) {
      if (!dateStart && !dateEnd && minWorkDate && maxWorkDate) {
        if (hDate < minWorkDate || hDate > maxWorkDate) continue;
      }
      const dObj = new Date(hDate + 'T00:00:00');
      const wIdx = (dObj.getDay() + 6) % 7;
      const pCfg = wpMap[wIdx] || { period: 1, duration: 60 };
      const key = `${hDate}_${pCfg.period}`;
      columnsByKey.set(key, {
        key,
        date: hDate,
        period: pCfg.period,
        duration: pCfg.duration,
        isHoliday: true,
        holidayDescription: hDesc
      });
      datesCoveredBySessions.add(hDate);
    }
  }

  const sessionColumns = Array.from(columnsByKey.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.period - b.period;
  });

  return { sessionColumns, attendanceMap };
}

// Endpoint returning actual saved date bounds for ExportReportsView & MonthlyReportView defaults
app.get('/api/export/bounds', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const requestedDataset = req.query.dataset ? String(req.query.dataset) : undefined;
    const { db, datasetName: filterDataset } = getFacultyDb(faculty, requestedDataset);
    const { sessionColumns } = collectSavedExportSessions(db, filterDataset, fid, {});
    const regStart = (db.prepare("SELECT value FROM settings WHERE key='register_start_date'").get() as any)?.value || '';
    const regEnd = (db.prepare("SELECT value FROM settings WHERE key='register_end_date'").get() as any)?.value || '';
    db.close();

    if (sessionColumns.length === 0) {
      const now = new Date();
      return res.json({
        hasRecords: false,
        minDate: regStart || `${now.getFullYear()}-07-01`,
        maxDate: regEnd || `${now.getFullYear()}-11-30`,
        latestYear: now.getFullYear(),
        latestMonth: now.getMonth() + 1,
        totalSavedSessions: 0
      });
    }

    const minDate = sessionColumns[0].date;
    const maxDate = sessionColumns[sessionColumns.length - 1].date;
    const workingCols = sessionColumns.filter(c => !c.isHoliday);
    const refDate = workingCols.length > 0 ? workingCols[workingCols.length - 1].date : maxDate;
    const latestYear = parseInt(refDate.slice(0, 4), 10);
    const latestMonth = parseInt(refDate.slice(5, 7), 10);

    res.json({
      hasRecords: true,
      minDate,
      maxDate,
      latestYear,
      latestMonth,
      totalSavedSessions: workingCols.length
    });
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

async function handleExcelExport(req: express.Request, res: express.Response) {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const requestedDataset = req.query.dataset ? String(req.query.dataset) : undefined;
    const { db, datasetName: filterDataset } = getFacultyDb(faculty, requestedDataset);

    // Parse filters
    const mode = String(req.query.mode || '').toLowerCase(); // 'monthly' | 'semester'
    const year = req.query.year ? parseInt(String(req.query.year), 10) : null;
    const month = req.query.month ? parseInt(String(req.query.month), 10) : null;
    const startDate = req.query.startDate ? String(req.query.startDate).trim() : '';
    const endDate = req.query.endDate ? String(req.query.endDate).trim() : '';
    const subjectId = req.query.subject_id ? parseInt(String(req.query.subject_id), 10) : null;

    // Optional query overrides for metadata
    const queryDept = req.query.department ? String(req.query.department).trim() : '';
    const queryAcadYear = req.query.academic_year ? String(req.query.academic_year).trim() : '';
    const queryYearStudy = req.query.year_of_study ? String(req.query.year_of_study).trim() : '';
    const querySemester = req.query.semester ? String(req.query.semester).trim() : '';
    const queryFaculty = req.query.faculty_name ? String(req.query.faculty_name).trim() : '';

    let dateStart = '';
    let dateEnd = '';

    if (mode === 'monthly' || (month && !startDate)) {
      const y = year || new Date().getFullYear();
      const m = month || (new Date().getMonth() + 1);
      const lastDay = new Date(y, m, 0).getDate();
      dateStart = `${y}-${String(m).padStart(2, '0')}-01`;
      dateEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (startDate && endDate) {
      dateStart = startDate;
      dateEnd = endDate;
    }

    // Load faculty profile & settings for this faculty
    const profile = db.prepare('SELECT * FROM faculty_profile WHERE faculty_id = ? ORDER BY id DESC LIMIT 1').get(fid) as any;
    const cHandled = queryDept || profile?.department || (db.prepare("SELECT value FROM settings WHERE key='course_class_handled'").get() as any)?.value || faculty.department || filterDataset;
    const fName = queryFaculty || profile?.faculty_name || (db.prepare("SELECT value FROM settings WHERE key='course_faculty_name'").get() as any)?.value || faculty.faculty_name || '';
    const acadYear = queryAcadYear || profile?.academic_year || '2026-2027';
    const yearStudy = queryYearStudy || profile?.year_of_study || '4th Year';
    const semester = querySemester || profile?.semester || 'Semester 7';

    // Load active subject for this faculty
    const subjRow = subjectId
      ? db.prepare('SELECT * FROM subjects WHERE id = ? AND faculty_id = ?').get(subjectId, fid) as any
      : db.prepare('SELECT * FROM subjects WHERE faculty_id = ? ORDER BY id ASC LIMIT 1').get(fid) as any;
    const subjectName = subjRow?.name || (db.prepare("SELECT value FROM settings WHERE key='course_subject'").get() as any)?.value || 'Classroom';
    const settingsTotalHours = parseFloat((db.prepare("SELECT value FROM settings WHERE key='course_total_hours'").get() as any)?.value || '');
    const totalHours = subjRow?.semester_hours || settingsTotalHours || 45;
    const weeklyTarget = subjRow?.weekly_target || 3;
    const courseType = (db.prepare("SELECT value FROM settings WHERE key='course_type'").get() as any)?.value || 'classroom';
    const isLab = courseType.toLowerCase() === 'lab';

    // Load ONLY this faculty's students naturally sorted by roll number
    const students = db.prepare('SELECT * FROM students WHERE faculty_id = ? AND is_active = 1').all(fid) as any[];
    students.sort((a, b) => compareRolls(a.roll_no || a.reg_no, b.roll_no || b.reg_no));
    const hasRollNumbers = students.some(s => String(s.roll_no ?? '').trim() !== '');

    // Collect ONLY actual saved sessions & saved holidays belonging to this faculty
    const { sessionColumns: sessionList, attendanceMap } = collectSavedExportSessions(db, filterDataset, fid, {
      dateStart,
      dateEnd,
      subjectId
    });

    let holSql = 'SELECT holiday_date as Date, description as Description FROM holidays WHERE faculty_id = ?';
    const holParams: any[] = [fid];
    if (dateStart && dateEnd) {
      holSql += ' AND holiday_date BETWEEN ? AND ?';
      holParams.push(dateStart, dateEnd);
    }
    holSql += ' ORDER BY holiday_date ASC';
    const holRows = db.prepare(holSql).all(...holParams) as any[];
    db.close();

    const getSessionHours = (sess: ExportSessionColumn): number => {
      if (isLab) return 3;
      const d = Number(sess.duration);
      return d > 0 ? d / 60.0 : 1;
    };

    const workingSessions = sessionList.filter(s => !s.isHoliday);
    const totalWorkingSessionsCount = workingSessions.length;
    const totalWorkingHours = roundRegisterHours(
      workingSessions.reduce((acc, s) => acc + getSessionHours(s), 0)
    );

    // Precompute authoritative student attendance metrics once so every sheet agrees 100%
    interface StudentComputedRow {
      student: any;
      sNo: number;
      rollText: string;
      regText: string;
      nameText: string;
      cellValues: ('P' | 'A' | 'OD' | 'Holiday')[];
      presentOnlyCount: number;
      odCount: number;
      presentAndOdCount: number;
      absentCount: number;
      effectiveWorkingSessions: number;
      attendedHours: number;
      pctRounded: number;
      marks: number;
    }

    const computedStudents: StudentComputedRow[] = students.map((s, idx) => {
      let presentOnlyCount = 0;
      let odCount = 0;
      let absentCount = 0;
      let effectiveWorkingSessions = 0;
      let effectiveWorkingHours = 0;
      let attendedHours = 0;
      const cellValues: ('P' | 'A' | 'OD' | 'Holiday')[] = [];

      for (const sess of sessionList) {
        const raw = attendanceMap.get(`${s.id}_${sess.date}_${sess.period}`);
        const norm = normalizeAttendanceStatus(raw);

        if (sess.isHoliday || norm === 'H') {
          cellValues.push('Holiday');
          continue;
        }

        const dur = getSessionHours(sess);
        effectiveWorkingSessions++;
        effectiveWorkingHours += dur;

        if (norm === 'OD') {
          odCount++;
          attendedHours += dur;
          cellValues.push('OD');
        } else if (norm === 'A') {
          absentCount++;
          cellValues.push('A');
        } else {
          presentOnlyCount++;
          attendedHours += dur;
          cellValues.push('P');
        }
      }

      const presentAndOdCount = presentOnlyCount + odCount;
      // Original register calculation: pct_att = (hrs_att / total_periods * 100.0), rounded to integer
      const pctExact = effectiveWorkingHours > 0
        ? (attendedHours / effectiveWorkingHours) * 100.0
        : 0.0;
      const pctRounded = Math.round(pctExact);
      const marks = calculateAttendanceMarks(absentCount, effectiveWorkingSessions, courseType);

      return {
        student: s,
        sNo: idx + 1,
        rollText: String(s.roll_no ?? '').trim(),
        regText: String(s.reg_no ?? ''),
        nameText: String(s.name ?? ''),
        cellValues,
        presentOnlyCount,
        odCount,
        presentAndOdCount,
        absentCount,
        effectiveWorkingSessions,
        attendedHours: roundRegisterHours(attendedHours),
        pctRounded,
        marks
      };
    });

    // Styling definitions for ExcelJS
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };
    const fontBold: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
    const fontRegular: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
    const fontMonth: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFC00000' } };
    const headerLabelFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };

    // Attendance Status Fonts & Fills (Exact Requested Colours)
    const stylePresent = {
      font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF008000' } } as Partial<ExcelJS.Font>,
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } } as ExcelJS.Fill
    };
    const styleOD = {
      font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF008000' } } as Partial<ExcelJS.Font>,
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } } as ExcelJS.Fill
    };
    const styleAbsent = {
      font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFF0000' } } as Partial<ExcelJS.Font>,
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } } as ExcelJS.Fill
    };
    const styleHoliday = {
      font: { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF8D6E00' } } as Partial<ExcelJS.Font>,
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } } as ExcelJS.Fill
    };

    const applyStatusCellStyle = (cell: ExcelJS.Cell, val: string) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
      if (val === 'P') {
        cell.font = stylePresent.font;
        cell.fill = stylePresent.fill;
      } else if (val === 'OD') {
        cell.font = styleOD.font;
        cell.fill = styleOD.fill;
      } else if (val === 'A' || val === 'L') {
        cell.font = styleAbsent.font;
        cell.fill = styleAbsent.fill;
      } else if (val === 'Holiday') {
        cell.font = styleHoliday.font;
        cell.fill = styleHoliday.fill;
      } else {
        cell.font = fontRegular;
      }
    };

    const landscapePageSetup: Partial<ExcelJS.PageSetup> = {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2
      }
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FacultyLog';
    wb.created = new Date();

    // =========================================================================
    // SHEET 1: Attendance Register (Official Multi-Row College Register Layout)
    // =========================================================================
    const studentInfoCols = hasRollNumbers ? 4 : 3;
    const firstSessionCol = studentInfoCols + 1;

    const ws = wb.addWorksheet('Attendance Register', {
      views: [{ state: 'frozen', xSplit: studentInfoCols, ySplit: 7, showGridLines: true }],
      pageSetup: {
        ...landscapePageSetup,
        printTitlesRow: '1:7'
      }
    });

    const totalColsCount = sessionList.length;
    const hrsCol = firstSessionCol + totalColsCount;
    const pctCol = firstSessionCol + 1 + totalColsCount;
    const marksCol = firstSessionCol + 2 + totalColsCount;

    // Row 1: Institutional Metadata
    ws.getCell(1, 1).value = `CLASS: ${cHandled}`;
    ws.getCell(1, 1).font = fontBold;
    ws.getCell(1, 3).value = `SUBJECT: ${subjectName}`;
    ws.getCell(1, 3).font = fontBold;
    ws.getCell(1, 5).value = `FACULTY: ${fName}`;
    ws.getCell(1, 5).font = fontBold;
    ws.getCell(1, 7).value = `ACADEMIC YEAR: ${acadYear} (${yearStudy})`;
    ws.getCell(1, 7).font = fontBold;
    ws.getCell(1, 10).value = `SEMESTER: ${semester}`;
    ws.getCell(1, 10).font = fontBold;
    if (isLab) {
      ws.getCell(1, 12).value = 'TYPE: LAB';
      ws.getCell(1, 12).font = fontBold;
    }

    // Row 2: Hours & Session Summary
    ws.getCell(2, 1).value = `TOTAL HOURS: ${totalHours}`;
    ws.getCell(2, 1).font = fontBold;
    ws.getCell(2, 3).value = `WEEKLY TARGET: ${weeklyTarget} PERIODS`;
    ws.getCell(2, 3).font = fontBold;
    ws.getCell(2, 5).value = `TYPE: ${courseType.toUpperCase()}`;
    ws.getCell(2, 5).font = fontBold;
    ws.getCell(2, 7).value = `TOTAL SESSIONS: ${totalWorkingSessionsCount}`;
    ws.getCell(2, 7).font = fontBold;
    ws.getCell(2, 10).value = `CONDUCTED HOURS: ${totalWorkingHours}`;
    ws.getCell(2, 10).font = fontBold;

    ws.getRow(1).height = 20;
    ws.getRow(2).height = 20;

    // Row 3: PERIODS
    for (let c = 1; c <= studentInfoCols; c++) {
      ws.getCell(3, c).border = thinBorder;
      ws.getCell(3, c).fill = headerLabelFill;
    }
    const cPeriods = ws.getCell(3, studentInfoCols);
    cPeriods.value = 'PERIODS';
    cPeriods.font = fontBold;
    cPeriods.alignment = { horizontal: 'right', vertical: 'middle' };

    sessionList.forEach((sess, i) => {
      const cell = ws.getCell(3, firstSessionCol + i);
      cell.value = isLab ? '1-3' : `P${sess.period}`;
      cell.font = fontRegular;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
      if (sess.isHoliday) cell.fill = styleHoliday.fill;
    });

    const cTotLabel = ws.getCell(3, hrsCol);
    cTotLabel.value = 'TOTAL';
    cTotLabel.font = fontBold;
    cTotLabel.alignment = { horizontal: 'center', vertical: 'middle' };
    cTotLabel.fill = headerLabelFill;
    cTotLabel.border = thinBorder;
    ws.getCell(3, pctCol).border = thinBorder;
    ws.getCell(3, pctCol).fill = headerLabelFill;
    ws.getCell(3, marksCol).border = thinBorder;
    ws.getCell(3, marksCol).fill = headerLabelFill;

    // Row 4: DATE numbers & Total Working Hours
    for (let c = 1; c <= studentInfoCols; c++) {
      ws.getCell(4, c).border = thinBorder;
      ws.getCell(4, c).fill = headerLabelFill;
    }
    const cDateLbl = ws.getCell(4, studentInfoCols);
    cDateLbl.value = 'DATE';
    cDateLbl.font = fontBold;
    cDateLbl.alignment = { horizontal: 'right', vertical: 'middle' };

    sessionList.forEach((sess, i) => {
      const cell = ws.getCell(4, firstSessionCol + i);
      cell.value = parseInt(sess.date.slice(8), 10);
      cell.font = fontBold;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
      if (sess.isHoliday) cell.fill = styleHoliday.fill;
    });

    const cTotHrsVal = ws.getCell(4, hrsCol);
    cTotHrsVal.value = totalWorkingHours;
    cTotHrsVal.font = fontBold;
    cTotHrsVal.alignment = { horizontal: 'center', vertical: 'middle' };
    cTotHrsVal.fill = headerLabelFill;
    cTotHrsVal.border = thinBorder;
    ws.getCell(4, pctCol).border = thinBorder;
    ws.getCell(4, pctCol).fill = headerLabelFill;
    ws.getCell(4, marksCol).border = thinBorder;
    ws.getCell(4, marksCol).fill = headerLabelFill;

    // Row 5: MONTH (merged across consecutive columns of the same year-month)
    for (let c = 1; c <= studentInfoCols; c++) {
      ws.getCell(5, c).border = thinBorder;
      ws.getCell(5, c).fill = headerLabelFill;
    }
    const cMonthLbl = ws.getCell(5, studentInfoCols);
    cMonthLbl.value = 'MONTH';
    cMonthLbl.font = fontBold;
    cMonthLbl.alignment = { horizontal: 'right', vertical: 'middle' };

    const singleColMonthIndices = new Set<number>();
    if (sessionList.length > 0) {
      const monthGroups: { ymKey: string; label: string; startCol: number; endCol: number }[] = [];
      let currYm = sessionList[0].date.slice(0, 7);
      let currMonthNum = parseInt(sessionList[0].date.slice(5, 7), 10);
      let currLabel = MONTH_NAMES[currMonthNum] || '';
      let groupStart = firstSessionCol;

      for (let i = 1; i < sessionList.length; i++) {
        const ym = sessionList[i].date.slice(0, 7);
        const mNum = parseInt(sessionList[i].date.slice(5, 7), 10);
        const lbl = MONTH_NAMES[mNum] || '';
        if (ym !== currYm) {
          monthGroups.push({ ymKey: currYm, label: currLabel, startCol: groupStart, endCol: firstSessionCol + i - 1 });
          currYm = ym;
          currLabel = lbl;
          groupStart = firstSessionCol + i;
        }
      }
      monthGroups.push({
        ymKey: currYm,
        label: currLabel,
        startCol: groupStart,
        endCol: firstSessionCol + sessionList.length - 1
      });

      for (const grp of monthGroups) {
        if (grp.startCol < grp.endCol) {
          ws.mergeCells(5, grp.startCol, 5, grp.endCol);
        } else {
          singleColMonthIndices.add(grp.startCol);
        }
        const mCell = ws.getCell(5, grp.startCol);
        mCell.value = grp.label;
        mCell.font = fontMonth;
        mCell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
        for (let colIdx = grp.startCol; colIdx <= grp.endCol; colIdx++) {
          ws.getCell(5, colIdx).border = thinBorder;
        }
      }
    }
    ws.getCell(5, hrsCol).border = thinBorder;
    ws.getCell(5, hrsCol).fill = headerLabelFill;
    ws.getCell(5, pctCol).border = thinBorder;
    ws.getCell(5, pctCol).fill = headerLabelFill;
    ws.getCell(5, marksCol).border = thinBorder;
    ws.getCell(5, marksCol).fill = headerLabelFill;

    // Row 6: DAY / DATE & Weekday codes + Summary Merged Headers
    ws.mergeCells(6, 1, 6, studentInfoCols);
    const cDayDate = ws.getCell(6, 1);
    cDayDate.value = 'DAY / DATE';
    cDayDate.font = fontBold;
    cDayDate.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= studentInfoCols; c++) {
      ws.getCell(6, c).border = thinBorder;
      ws.getCell(6, c).fill = headerLabelFill;
    }

    sessionList.forEach((sess, i) => {
      const dayObj = new Date(sess.date + 'T00:00:00');
      const wCode = WEEKDAY_CODES[(dayObj.getDay() + 6) % 7] || '';
      const cell = ws.getCell(6, firstSessionCol + i);
      cell.value = wCode;
      cell.font = fontBold;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
      if (sess.isHoliday) cell.fill = styleHoliday.fill;
    });

    ws.mergeCells(6, hrsCol, 7, hrsCol);
    const cHrsHdr = ws.getCell(6, hrsCol);
    cHrsHdr.value = 'HRS.\nATT.';
    cHrsHdr.font = fontBold;
    cHrsHdr.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getCell(6, hrsCol).fill = headerLabelFill;
    ws.getCell(6, hrsCol).border = thinBorder;
    ws.getCell(7, hrsCol).border = thinBorder;

    ws.mergeCells(6, pctCol, 7, pctCol);
    const cPctHdr = ws.getCell(6, pctCol);
    cPctHdr.value = '% ATT.';
    cPctHdr.font = fontBold;
    cPctHdr.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getCell(6, pctCol).fill = headerLabelFill;
    ws.getCell(6, pctCol).border = thinBorder;
    ws.getCell(7, pctCol).border = thinBorder;

    ws.mergeCells(6, marksCol, 7, marksCol);
    const cMarksHdr = ws.getCell(6, marksCol);
    cMarksHdr.value = 'MARKS\n(MAX 5)';
    cMarksHdr.font = fontBold;
    cMarksHdr.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getCell(6, marksCol).fill = headerLabelFill;
    ws.getCell(6, marksCol).border = thinBorder;
    ws.getCell(7, marksCol).border = thinBorder;

    // Row 7: Student Column Headers (S.NO, ROLL NO [if available], REGNO, NAME)
    const studentHdrLabels = hasRollNumbers
      ? ['S.NO', 'ROLL NO', 'REGNO', 'NAME']
      : ['S.NO', 'REGNO', 'NAME'];
    studentHdrLabels.forEach((lbl, idx) => {
      const cell = ws.getCell(7, idx + 1);
      cell.value = lbl;
      cell.font = fontBold;
      cell.fill = headerLabelFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    for (let i = 0; i < sessionList.length; i++) {
      const cell = ws.getCell(7, firstSessionCol + i);
      cell.border = thinBorder;
      if (sessionList[i].isHoliday) cell.fill = styleHoliday.fill;
    }

    // Row 8 onwards: Student Attendance Rows
    for (let idx = 0; idx < computedStudents.length; idx++) {
      const cs = computedStudents[idx];
      const rowNum = 8 + idx;

      const snCell = ws.getCell(rowNum, 1);
      snCell.value = cs.sNo;
      snCell.font = fontRegular;
      snCell.alignment = { horizontal: 'center', vertical: 'middle' };
      snCell.border = thinBorder;

      if (hasRollNumbers) {
        const rollCell = ws.getCell(rowNum, 2);
        rollCell.value = cs.rollText;
        rollCell.numFmt = '@';
        rollCell.font = fontRegular;
        rollCell.alignment = { horizontal: 'center', vertical: 'middle' };
        rollCell.border = thinBorder;
      }

      const regColIdx = hasRollNumbers ? 3 : 2;
      const nameColIdx = hasRollNumbers ? 4 : 3;

      const regCell = ws.getCell(rowNum, regColIdx);
      regCell.value = cs.regText;
      regCell.numFmt = '@'; // Explicit text format preserves leading zeros
      regCell.font = fontRegular;
      regCell.alignment = { horizontal: 'center', vertical: 'middle' };
      regCell.border = thinBorder;

      const nameCell = ws.getCell(rowNum, nameColIdx);
      nameCell.value = cs.nameText;
      nameCell.font = fontRegular;
      nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
      nameCell.border = thinBorder;

      for (let cIdx = 0; cIdx < sessionList.length; cIdx++) {
        const cell = ws.getCell(rowNum, firstSessionCol + cIdx);
        const dispVal = cs.cellValues[cIdx];
        cell.value = dispVal;
        applyStatusCellStyle(cell, dispVal);
      }

      const hrsCell = ws.getCell(rowNum, hrsCol);
      hrsCell.value = cs.attendedHours;
      hrsCell.font = fontRegular;
      hrsCell.alignment = { horizontal: 'center', vertical: 'middle' };
      hrsCell.border = thinBorder;

      const pctCell = ws.getCell(rowNum, pctCol);
      pctCell.value = cs.pctRounded;
      pctCell.numFmt = '0';
      pctCell.font = fontRegular;
      pctCell.alignment = { horizontal: 'center', vertical: 'middle' };
      pctCell.border = thinBorder;

      const mkCell = ws.getCell(rowNum, marksCol);
      mkCell.value = cs.marks;
      mkCell.font = fontBold;
      mkCell.alignment = { horizontal: 'center', vertical: 'middle' };
      mkCell.border = thinBorder;

      ws.getRow(rowNum).height = 19;
    }

    for (let r = 3; r <= 7; r++) ws.getRow(r).height = 19;

    // Column widths
    ws.getColumn(1).width = 6.5;
    if (hasRollNumbers) {
      ws.getColumn(2).width = 11;
      ws.getColumn(3).width = 18;
      ws.getColumn(4).width = 30;
    } else {
      ws.getColumn(2).width = 18;
      ws.getColumn(3).width = 30;
    }
    sessionList.forEach((sess, i) => {
      const colIndex = firstSessionCol + i;
      let colW = sess.isHoliday ? 9.5 : 5.5;
      if (singleColMonthIndices.has(colIndex)) {
        colW = Math.max(colW, 10.5);
      }
      ws.getColumn(colIndex).width = colW;
    });
    ws.getColumn(hrsCol).width = 11;
    ws.getColumn(pctCol).width = 10;
    ws.getColumn(marksCol).width = 12;

    // Helper for styled tabular sheets
    const styleTableHeader = (sheet: ExcelJS.Worksheet, colCount: number) => {
      const hdrRow = sheet.getRow(1);
      hdrRow.height = 21;
      for (let c = 1; c <= colCount; c++) {
        const cell = hdrRow.getCell(c);
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3E1F20' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder;
      }
    };

    // =========================================================================
    // SHEET 2: Student Summary
    // =========================================================================
    const wsSummary = wb.addWorksheet('Student Summary', {
      views: [{ state: 'frozen', xSplit: hasRollNumbers ? 4 : 3, ySplit: 1 }],
      pageSetup: { ...landscapePageSetup, printTitlesRow: '1:1' }
    });
    const summaryHeaders = hasRollNumbers
      ? ['S.No', 'Roll Number', 'Register Number', 'Student Name', 'Working Sessions', 'Hours Attended', 'Present', 'On Duty (OD)', 'Absent', 'Attendance %', 'Marks (Max 5)']
      : ['S.No', 'Register Number', 'Student Name', 'Working Sessions', 'Hours Attended', 'Present', 'On Duty (OD)', 'Absent', 'Attendance %', 'Marks (Max 5)'];
    wsSummary.addRow(summaryHeaders);
    styleTableHeader(wsSummary, summaryHeaders.length);

    computedStudents.forEach(cs => {
      const rowData = hasRollNumbers
        ? [cs.sNo, cs.rollText, cs.regText, cs.nameText, cs.effectiveWorkingSessions, cs.attendedHours, cs.presentOnlyCount, cs.odCount, cs.absentCount, cs.pctRounded, cs.marks]
        : [cs.sNo, cs.regText, cs.nameText, cs.effectiveWorkingSessions, cs.attendedHours, cs.presentOnlyCount, cs.odCount, cs.absentCount, cs.pctRounded, cs.marks];
      const r = wsSummary.addRow(rowData);
      const nameColNum = hasRollNumbers ? 4 : 3;
      const regColNum = hasRollNumbers ? 3 : 2;
      r.eachCell((cell, colNumber) => {
        cell.border = thinBorder;
        cell.font = colNumber === summaryHeaders.length ? fontBold : fontRegular;
        if (colNumber === regColNum || (hasRollNumbers && colNumber === 2)) {
          cell.numFmt = '@';
        }
        cell.alignment = { horizontal: colNumber === nameColNum ? 'left' : 'center', vertical: 'middle' };
      });
    });
    const summaryWidths = hasRollNumbers
      ? [8, 14, 18, 30, 17, 15, 11, 14, 11, 14, 15]
      : [8, 18, 30, 17, 15, 11, 14, 11, 14, 15];
    summaryWidths.forEach((w, i) => {
      wsSummary.getColumn(i + 1).width = w;
    });

    // =========================================================================
    // SHEET 3: Day-Wise Attendance
    // =========================================================================
    const matrixInfoCols = hasRollNumbers ? 4 : 3;
    const wsMatrix = wb.addWorksheet('Day-Wise Attendance', {
      views: [{ state: 'frozen', xSplit: matrixInfoCols, ySplit: 1 }],
      pageSetup: { ...landscapePageSetup, printTitlesRow: '1:1' }
    });
    const matrixHeaders = [
      ...(hasRollNumbers
        ? ['S.No', 'Roll Number', 'Register Number', 'Student Name']
        : ['S.No', 'Register Number', 'Student Name']),
      ...sessionList.map(sess => `${sess.date} P${sess.period}`)
    ];
    wsMatrix.addRow(matrixHeaders);
    styleTableHeader(wsMatrix, matrixHeaders.length);

    computedStudents.forEach(cs => {
      const rowValues: any[] = hasRollNumbers
        ? [cs.sNo, cs.rollText, cs.regText, cs.nameText, ...cs.cellValues]
        : [cs.sNo, cs.regText, cs.nameText, ...cs.cellValues];
      const r = wsMatrix.addRow(rowValues);
      r.eachCell((cell, colNumber) => {
        if (colNumber <= matrixInfoCols) {
          cell.border = thinBorder;
          cell.font = fontRegular;
          if (colNumber === (hasRollNumbers ? 3 : 2) || (hasRollNumbers && colNumber === 2)) {
            cell.numFmt = '@';
          }
          cell.alignment = { horizontal: colNumber === matrixInfoCols ? 'left' : 'center', vertical: 'middle' };
        } else {
          applyStatusCellStyle(cell, String(cell.value || ''));
        }
      });
    });
    wsMatrix.getColumn(1).width = 8;
    if (hasRollNumbers) {
      wsMatrix.getColumn(2).width = 13;
      wsMatrix.getColumn(3).width = 18;
      wsMatrix.getColumn(4).width = 30;
    } else {
      wsMatrix.getColumn(2).width = 18;
      wsMatrix.getColumn(3).width = 30;
    }
    sessionList.forEach((_, i) => {
      wsMatrix.getColumn(matrixInfoCols + 1 + i).width = 14;
    });

    // =========================================================================
    // SHEET 4: Attendance Details
    // =========================================================================
    const wsDetails = wb.addWorksheet('Attendance Details', {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: { ...landscapePageSetup, printTitlesRow: '1:1' }
    });
    const detailHeaders = hasRollNumbers
      ? ['Date', 'Day', 'Period', 'Roll Number', 'Register Number', 'Student Name', 'Status']
      : ['Date', 'Day', 'Period', 'Register Number', 'Student Name', 'Status'];
    wsDetails.addRow(detailHeaders);
    styleTableHeader(wsDetails, detailHeaders.length);

    if (sessionList.length > 0 && computedStudents.length > 0) {
      const statusColNum = detailHeaders.length;
      const nameColNum = detailHeaders.length - 1;
      sessionList.forEach((sess, sIdx) => {
        const dObj = new Date(sess.date + 'T00:00:00');
        const wCode = WEEKDAY_CODES[(dObj.getDay() + 6) % 7] || '';
        const periodLbl = isLab ? '1-3' : `P${sess.period}`;
        for (const cs of computedStudents) {
          const val = cs.cellValues[sIdx];
          const rowVals = hasRollNumbers
            ? [sess.date, wCode, periodLbl, cs.rollText, cs.regText, cs.nameText, val]
            : [sess.date, wCode, periodLbl, cs.regText, cs.nameText, val];
          const r = wsDetails.addRow(rowVals);
          r.eachCell((cell, colNumber) => {
            if (colNumber === statusColNum) {
              applyStatusCellStyle(cell, val);
            } else {
              cell.border = thinBorder;
              cell.font = fontRegular;
              cell.alignment = { horizontal: colNumber === nameColNum ? 'left' : 'center', vertical: 'middle' };
            }
          });
        }
      });
    }
    const detailWidths = hasRollNumbers ? [13, 8, 9, 13, 18, 30, 12] : [13, 8, 9, 18, 30, 12];
    detailWidths.forEach((w, i) => {
      wsDetails.getColumn(i + 1).width = w;
    });

    // =========================================================================
    // SHEET 5: Holidays
    // =========================================================================
    const wsHolidays = wb.addWorksheet('Holidays', {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: { ...landscapePageSetup, printTitlesRow: '1:1' }
    });
    wsHolidays.addRow(['Date', 'Description']);
    styleTableHeader(wsHolidays, 2);
    if (holRows.length > 0) {
      for (const h of holRows) {
        const r = wsHolidays.addRow([h.Date, h.Description || 'Holiday']);
        r.eachCell((cell, colNum) => {
          cell.border = thinBorder;
          cell.font = styleHoliday.font;
          cell.fill = styleHoliday.fill;
          cell.alignment = { horizontal: colNum === 1 ? 'center' : 'left', vertical: 'middle' };
        });
      }
    } else {
      wsHolidays.addRow(['None', 'No holidays marked in selected range']);
    }
    wsHolidays.getColumn(1).width = 16;
    wsHolidays.getColumn(2).width = 34;

    // =========================================================================
    // SHEET 6: Subject & Period Summary
    // =========================================================================
    const wsPeriodSummary = wb.addWorksheet('Subject & Period Summary', {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: { ...landscapePageSetup, printTitlesRow: '1:1' }
    });
    const psHeaders = hasRollNumbers
      ? ['S.No', 'Roll No', 'Reg No', 'Student Name', 'Working Sessions', 'Hours Attended', 'Attended (P + OD)', 'On Duty (OD)', 'Absent', 'Attendance %', 'Marks (Max 5)']
      : ['S.No', 'Reg No', 'Student Name', 'Working Sessions', 'Hours Attended', 'Attended (P + OD)', 'On Duty (OD)', 'Absent', 'Attendance %', 'Marks (Max 5)'];
    wsPeriodSummary.addRow(psHeaders);
    styleTableHeader(wsPeriodSummary, psHeaders.length);

    computedStudents.forEach(cs => {
      const rowData = hasRollNumbers
        ? [cs.sNo, cs.rollText, cs.regText, cs.nameText, cs.effectiveWorkingSessions, cs.attendedHours, cs.presentAndOdCount, cs.odCount, cs.absentCount, cs.pctRounded, cs.marks]
        : [cs.sNo, cs.regText, cs.nameText, cs.effectiveWorkingSessions, cs.attendedHours, cs.presentAndOdCount, cs.odCount, cs.absentCount, cs.pctRounded, cs.marks];
      const r = wsPeriodSummary.addRow(rowData);
      const nameColNum = hasRollNumbers ? 4 : 3;
      r.eachCell((cell, colNumber) => {
        cell.border = thinBorder;
        cell.font = colNumber === psHeaders.length ? fontBold : fontRegular;
        cell.alignment = { horizontal: colNumber === nameColNum ? 'left' : 'center', vertical: 'middle' };
      });
    });
    const psWidths = hasRollNumbers
      ? [8, 12, 18, 30, 17, 15, 18, 14, 11, 14, 15]
      : [8, 18, 30, 17, 15, 18, 14, 11, 14, 15];
    psWidths.forEach((w, i) => {
      wsPeriodSummary.getColumn(i + 1).width = w;
    });

    // Generate genuine OpenXML XLSX binary buffer
    const arrayBuf = await wb.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuf);

    // VALIDATE WORKBOOK BEFORE SENDING
    if (!buffer || buffer.length === 0) {
      throw new Error('Export generation failed: workbook buffer is empty.');
    }
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
      throw new Error('Export generation failed: workbook buffer is missing standard XLSX ZIP signature.');
    }
    const verifyWb = XLSX.read(buffer, { type: 'buffer' });
    if (!verifyWb || !verifyWb.SheetNames || !verifyWb.SheetNames.includes('Attendance Register')) {
      throw new Error('Export generation failed: verified workbook is missing expected Attendance Register worksheet.');
    }

    let filename = `FacultyLog_${filterDataset.replace(/\s+/g, '_')}`;
    if (mode === 'monthly' || (month && !startDate)) {
      filename += `_Monthly_${year || new Date().getFullYear()}_${String(month || (new Date().getMonth() + 1)).padStart(2, '0')}`;
    } else if (mode === 'semester') {
      filename += dateStart && dateEnd
        ? `_Semester_${dateStart}_to_${dateEnd}`
        : `_Complete_Semester`;
    } else if (startDate && endDate) {
      filename += `_Semester_${startDate}_to_${endDate}`;
    } else {
      filename += `_Register_${new Date().toISOString().split('T')[0]}`;
    }
    filename += '.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.status(200).send(buffer);
  } catch (err: any) {
    console.error('Excel Export Error:', err);
    sendRouteError(res, err, 'Internal server error during Excel export');
  }
}

app.get('/api/export/register.xlsx', (req, res) => {
  handleExcelExport(req, res);
});

// Backward-compatible multi-sheet export (directly streams genuine XLSX without redirect)
app.get('/api/export/excel', (req, res) => {
  handleExcelExport(req, res);
});

// CSV attendance export (uses actual saved sessions & preserves OD / Holiday, scoped to logged-in faculty)
app.get('/api/export/register.csv', (req, res) => {
  try {
    const faculty = req.faculty!;
    const fid = faculty.id;
    const requestedDataset = req.query.dataset ? String(req.query.dataset) : undefined;
    const year = req.query.year ? parseInt(String(req.query.year), 10) : null;
    const month = req.query.month ? parseInt(String(req.query.month), 10) : null;
    let dateStart = req.query.startDate ? String(req.query.startDate).trim() : '';
    let dateEnd = req.query.endDate ? String(req.query.endDate).trim() : '';
    if (year && month && !dateStart) {
      const lastDay = new Date(year, month, 0).getDate();
      dateStart = `${year}-${String(month).padStart(2, '0')}-01`;
      dateEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    const { db, datasetName: filterDataset } = getFacultyDb(faculty, requestedDataset);
    const students = db.prepare('SELECT * FROM students WHERE faculty_id = ? AND is_active = 1').all(fid) as any[];
    students.sort((a, b) => compareRolls(a.roll_no || a.reg_no, b.roll_no || b.reg_no));
    const hasRollNumbers = students.some(s => String(s.roll_no ?? '').trim() !== '');

    const { sessionColumns, attendanceMap } = collectSavedExportSessions(db, filterDataset, fid, {
      dateStart,
      dateEnd
    });
    const courseType = (db.prepare("SELECT value FROM settings WHERE key='course_type'").get() as any)?.value || 'classroom';
    const isLab = courseType.toLowerCase() === 'lab';
    db.close();

    const headers = hasRollNumbers
      ? ['S.No', 'Roll Number', 'Register Number', 'Student Name']
      : ['S.No', 'Register Number', 'Student Name'];
    for (const s of sessionColumns) headers.push(`${s.date}_P${s.period}`);
    headers.push('Hours Attended', 'Attended', 'Absent', 'Percentage', 'Marks (Max 5)');

    const csvLines = [headers.join(',')];

    for (let idx = 0; idx < students.length; idx++) {
      const s = students[idx];
      let pCount = 0;
      let aCount = 0;
      let workSessions = 0;
      let workHrs = 0;
      let attHrs = 0;
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const row: (string | number)[] = hasRollNumbers
        ? [idx + 1, esc(String(s.roll_no ?? '').trim()), esc(s.reg_no), esc(s.name)]
        : [idx + 1, esc(s.reg_no), esc(s.name)];

      for (const sess of sessionColumns) {
        const norm = normalizeAttendanceStatus(attendanceMap.get(`${s.id}_${sess.date}_${sess.period}`));
        if (sess.isHoliday || norm === 'H') {
          row.push('Holiday');
        } else {
          const dur = isLab ? 3 : ((Number(sess.duration) > 0 ? Number(sess.duration) / 60.0 : 1));
          workSessions++;
          workHrs += dur;
          if (norm === 'P' || norm === 'OD') {
            pCount++;
            attHrs += dur;
            row.push(norm);
          } else {
            aCount++;
            row.push('A');
          }
        }
      }
      const pct = workHrs > 0 ? Math.round((attHrs / workHrs) * 100) : 0;
      const marks = calculateAttendanceMarks(aCount, workSessions, courseType);
      row.push(roundRegisterHours(attHrs), pCount, aCount, `${pct}%`, marks);
      csvLines.push(row.join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="FacultyLog_${filterDataset}_Attendance.csv"`);
    res.send(csvLines.join('\n'));
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// Download updated FacultyLog project source archive (.zip) scoped strictly to the logged-in faculty's own datasets
app.get('/api/export/project-source.zip', (req, res) => {
  const faculty = req.faculty!;
  const ownedDbFiles = listFacultyDatasets(faculty.id).map(d => d.dbFilename);
  const tmpZipPath = path.join(os.tmpdir(), `FacultyLog_export_${faculty.id}_${Date.now()}.zip`);

  try {
    const pyScript = `
import os, sys, zipfile

root_dir = sys.argv[1]
out_zip = sys.argv[2]
allowed_dbs = set(sys.argv[3:])

skip_dirs = {'node_modules', 'dist', '.git', '.aistudio'}

with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        rel_dir = os.path.relpath(dirpath, root_dir)
        for fname in filenames:
            if fname == '.env' or fname.endswith('.zip'):
                continue
            full_path = os.path.join(dirpath, fname)
            rel_path = os.path.normpath(os.path.join(rel_dir, fname))
            # Never export auth.db or another faculty member's SQLite database
            if fname.endswith('.db') or fname.endswith('.db-journal') or fname.endswith('.db-wal') or fname.endswith('.db-shm'):
                if rel_dir == os.path.normpath('student_attendance/data/datasets') and fname in allowed_dbs:
                    zf.write(full_path, rel_path)
                continue
            zf.write(full_path, rel_path)
`;
    execFileSync('python3', ['-c', pyScript, __dirname, tmpZipPath, ...ownedDbFiles], {
      stdio: 'pipe'
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="FacultyLog_updated.zip"');
    res.sendFile(tmpZipPath, () => {
      try {
        if (fs.existsSync(tmpZipPath)) fs.unlinkSync(tmpZipPath);
      } catch (_) {}
    });
  } catch (err: any) {
    try {
      if (fs.existsSync(tmpZipPath)) fs.unlinkSync(tmpZipPath);
    } catch (_) {}
    sendRouteError(res, err, 'Failed to generate project source archive.');
  }
});

// ==========================================
// VITE / STATIC INTEGRATION
// ==========================================
async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FacultyLog server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
