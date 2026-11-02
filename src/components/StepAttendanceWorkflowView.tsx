import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Calendar,
  CheckCircle2,
  Table,
  Layers,
  Clock,
  BookOpen,
  User,
  Building,
  GraduationCap,
  Save,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Download,
  Trash2,
  Edit2,
  RefreshCw,
  Search,
  Filter,
  Users,
  Eye,
  ListFilter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { DatasetInfo, Student } from '../types';
import { apiFetch, downloadAuthenticatedFile } from '../authClient';

interface StepAttendanceWorkflowViewProps {
  activeDataset: string;
  datasets: DatasetInfo[];
  students: Student[];
  onRefresh: () => void;
  onSelectDataset: (name: string) => void;
  onNavigateToExport: () => void;
}

interface WeekdayPeriodConfig {
  period: number;
  duration: number;
  subject_id?: number;
}

interface ScheduledSession {
  sessionNumber: number;
  sessionId?: number;
  date: string;
  day: string;
  subjectId: number;
  subjectName: string;
  period: number;
  duration: number;
  status: string; // 'Pending' | 'Saved' | 'Updated'
  absentInput: string;
  odInput: string;
  leaveInput: string;
  presentCount: number;
  absentCount: number;
  totalStudents: number;
  hasAttendance: boolean;
}

export const StepAttendanceWorkflowView: React.FC<StepAttendanceWorkflowViewProps> = ({
  activeDataset,
  datasets,
  students,
  onRefresh,
  onSelectDataset,
  onNavigateToExport
}) => {
  // Accordion Step Open States
  const [step1Open, setStep1Open] = useState<boolean>(true);
  const [step2Open, setStep2Open] = useState<boolean>(true);
  const [step3Open, setStep3Open] = useState<boolean>(true);

  // STEP 1 STATE: Student Info & Course Details
  const [facultyName, setFacultyName] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [academicYear, setAcademicYear] = useState<string>('2026-2027');
  const [yearOfStudy, setYearOfStudy] = useState<string>('Final Year (4th Year)');
  const [semester, setSemester] = useState<string>('Semester 7');
  const [classSection, setClassSection] = useState<string>(activeDataset || 'Class 1');
  const [subjectName, setSubjectName] = useState<string>('');
  const [totalHours, setTotalHours] = useState<number>(45);
  const [courseType, setCourseType] = useState<'classroom' | 'lab'>('classroom');
  const [importMode, setImportMode] = useState<'existing' | 'new'>('existing');
  const [newDatasetName, setNewDatasetName] = useState<string>('');

  // Step 1 File Upload & Preview States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [rawUploadedRows, setRawUploadedRows] = useState<any[]>([]);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    validCount: number;
    duplicateCount: number;
    invalidCount: number;
    rows: { sNo: number | string; rollNo?: string; regNo: string; name: string; status: 'valid' | 'duplicate' | 'invalid'; error?: string }[];
  } | null>(null);
  const [savingStep1, setSavingStep1] = useState<boolean>(false);
  const [step1SuccessMsg, setStep1SuccessMsg] = useState<string | null>(null);

  // STEP 2 STATE: Course Dates & Class Schedule
  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  // Weekday selection: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([0, 3]); // Monday & Thursday default
  const [weekdayPeriods, setWeekdayPeriods] = useState<Record<number, WeekdayPeriodConfig>>({
    0: { period: 1, duration: 60 },
    3: { period: 4, duration: 60 }
  });
  const [excludeHolidays, setExcludeHolidays] = useState<boolean>(true);
  const [savingStep2, setSavingStep2] = useState<boolean>(false);
  const [step2SuccessMsg, setStep2SuccessMsg] = useState<string | null>(null);

  // STEP 3 STATE: Full Schedule Attendance Sheet
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'table' | 'form'>('table');
  const [activeFormSessionIndex, setActiveFormSessionIndex] = useState<number>(0);
  const [formStudentStatuses, setFormStudentStatuses] = useState<Record<string, 'P' | 'A' | 'OD' | 'L'>>({});
  const [savingAll, setSavingAll] = useState<boolean>(false);
  const [savingSessionId, setSavingSessionId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'saved'>('all');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [generalMessage, setGeneralMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirmMarkAllPresent, setConfirmMarkAllPresent] = useState<boolean>(false);
  const [sessionToConfirmOverwrite, setSessionToConfirmOverwrite] = useState<ScheduledSession | null>(null);
  const [confirmOverwriteAll, setConfirmOverwriteAll] = useState<boolean>(false);

  // Weekday mapping
  const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Load existing profile & schedule config on mount and dataset change
  useEffect(() => {
    fetchProfileAndSettings();
    fetchScheduledSessions();
  }, [activeDataset]);

  const fetchProfileAndSettings = async () => {
    try {
      const [profRes, setRes, schedRes] = await Promise.all([
        apiFetch('/api/profile'),
        apiFetch('/api/settings'),
        apiFetch('/api/schedule/config')
      ]);

      if (profRes.ok) {
        const pData = await profRes.json();
        if (pData.profile) {
          if (pData.profile.faculty_name) setFacultyName(pData.profile.faculty_name);
          if (pData.profile.department) setDepartment(pData.profile.department);
          if (pData.profile.academic_year) setAcademicYear(pData.profile.academic_year);
          if (pData.profile.year_of_study) setYearOfStudy(pData.profile.year_of_study);
          if (pData.profile.semester) setSemester(pData.profile.semester);
          if (pData.profile.class_section) setClassSection(pData.profile.class_section);
        }
      }

      if (setRes.ok) {
        const sData = await setRes.json();
        if (sData.course_subject) setSubjectName(sData.course_subject);
        if (sData.course_total_hours) setTotalHours(parseFloat(sData.course_total_hours) || 45);
        if (sData.course_type) setCourseType(sData.course_type === 'lab' ? 'lab' : 'classroom');
      }

      if (schedRes.ok) {
        const scData = await schedRes.json();
        if (scData.config) {
          if (scData.config.start_date) setStartDate(scData.config.start_date);
          if (scData.config.end_date) setEndDate(scData.config.end_date);
          if (Array.isArray(scData.config.weekdays) && scData.config.weekdays.length > 0) {
            setSelectedWeekdays(scData.config.weekdays);
          }
          if (scData.config.weekday_periods) {
            setWeekdayPeriods(scData.config.weekday_periods);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load profile/schedule config:', err);
    }
  };

  const fetchScheduledSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await apiFetch(`/api/schedule/sessions?dataset=${encodeURIComponent(activeDataset)}`);
      const data = await res.json();
      if (res.ok) {
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load schedule sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  // Keep form student statuses in sync when picking a session in List Form View
  useEffect(() => {
    if (sessions.length > 0 && activeFormSessionIndex < sessions.length) {
      const sess = sessions[activeFormSessionIndex];
      const raw = (sess.absentInput || '').trim();
      const rawLower = raw.toLowerCase();

      const initialMap: Record<string, 'P' | 'A' | 'OD' | 'L'> = {};
      students.forEach(s => { initialMap[s.reg_no] = 'P'; });

      if (rawLower === 'p' || rawLower === 'present' || rawLower === 'holiday' || rawLower === 'h') {
        setFormStudentStatuses(initialMap);
        return;
      }

      if (rawLower === 'od' || rawLower === 'on duty') {
        students.forEach(s => { initialMap[s.reg_no] = 'OD'; });
        setFormStudentStatuses(initialMap);
        return;
      }

      // Parse tokens supporting '23, 35, OD: 42' or 'OD: 23, 35'
      const tokens = raw
        .replace(/;/g, ' , ')
        .replace(/(OD:|L:|A:|Leave:|Absent:|OnDuty:)/gi, ' $1 ')
        .split(/[,\s]+/)
        .map(t => t.trim())
        .filter(Boolean);

      let currentMode: 'A' | 'OD' | 'L' = 'A';
      for (const token of tokens) {
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

        // Match student by Roll number or Reg number
        const matched = students.find(s => {
          const r = (s.roll_no || '').toLowerCase();
          const reg = s.reg_no.toLowerCase();
          return r === tokLower || reg === tokLower || (/^\d+$/.test(tokLower) && String(parseInt(r, 10)) === tokLower);
        });

        if (matched) {
          initialMap[matched.reg_no] = currentMode;
        }
      }

      setFormStudentStatuses(initialMap);
    }
  }, [activeFormSessionIndex, sessions, students]);

  // Handle student file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setStep1SuccessMsg(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', raw: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', header: 1 });

        if (!rawJson || rawJson.length < 2) {
          throw new Error('Spreadsheet has insufficient rows. Minimum header + 1 student row required.');
        }

        // Smart scan for header row
        let headerRowIndex = 0;
        for (let r = 0; r < Math.min(15, rawJson.length); r++) {
          const rowStr = rawJson[r].map((c: any) => String(c).toLowerCase().trim()).join(' ');
          if (
            (rowStr.includes('reg') || rowStr.includes('usn') || rowStr.includes('roll')) &&
            (rowStr.includes('name') || rowStr.includes('student'))
          ) {
            headerRowIndex = r;
            break;
          }
        }

        const rowsWithHeader: any[] = XLSX.utils.sheet_to_json(worksheet, {
          range: headerRowIndex,
          defval: '',
          raw: false
        });

        setRawUploadedRows(rowsWithHeader);
        await validateStudentRows(rowsWithHeader, importMode);
      } catch (err: any) {
        setGeneralMessage({ type: 'error', text: `Failed to parse spreadsheet: ${err.message}` });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const validateStudentRows = async (rows: any[], modeOverride: 'existing' | 'new' = importMode) => {
    try {
      const res = await apiFetch('/api/students/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, importMode: modeOverride })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Student validation failed');

      setParsedRows(data.rows.filter((r: any) => r.status === 'valid'));
      setImportSummary({
        total: data.total,
        validCount: data.validCount,
        duplicateCount: data.duplicateCount,
        invalidCount: data.invalidCount,
        rows: data.rows
      });
    } catch (err: any) {
      setGeneralMessage({ type: 'error', text: err.message || 'Failed to validate uploaded student rows.' });
    }
  };

  useEffect(() => {
    if (rawUploadedRows.length > 0) {
      validateStudentRows(rawUploadedRows, importMode);
    }
  }, [importMode]);

  // STEP 1 SUBMISSION
  const handleSaveStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStep1(true);
    setGeneralMessage(null);
    setStep1SuccessMsg(null);

    try {
      const payload = {
        importMode,
        newDatasetName,
        faculty_name: facultyName,
        department,
        academic_year: academicYear,
        year_of_study: yearOfStudy,
        semester,
        class_section: importMode === 'new' ? newDatasetName : classSection,
        subject_name: subjectName,
        total_hours: totalHours,
        course_type: courseType,
        students: parsedRows
      };

      const res = await apiFetch('/api/datasets/import-with-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save student info & course details');

      const dupNotice = data.skippedDuplicates > 0 ? ` (${data.skippedDuplicates} duplicate record(s) safely skipped)` : '';
      setStep1SuccessMsg(
        `Successfully saved course details (${courseType.toUpperCase()}) and imported ${data.importedCount} student records into ${data.activeDataset}${dupNotice}.`
      );
      onRefresh();
      if (data.activeDataset !== activeDataset) {
        onSelectDataset(data.activeDataset);
      }
      setStep2Open(true);
    } catch (err: any) {
      setGeneralMessage({ type: 'error', text: err.message });
    } finally {
      setSavingStep1(false);
    }
  };

  // Weekday toggle helper
  const toggleWeekday = (dayIdx: number) => {
    setSelectedWeekdays(prev => {
      const exists = prev.includes(dayIdx);
      const next = exists ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx].sort((a, b) => a - b);

      // Initialize default period config for added day if missing
      if (!exists && !weekdayPeriods[dayIdx]) {
        setWeekdayPeriods(wp => ({
          ...wp,
          [dayIdx]: { period: dayIdx === 3 ? 4 : 1, duration: courseType === 'lab' ? 180 : 60 }
        }));
      }
      return next;
    });
  };

  const updateWeekdayPeriod = (dayIdx: number, field: keyof WeekdayPeriodConfig, val: any) => {
    setWeekdayPeriods(prev => ({
      ...prev,
      [dayIdx]: {
        ...(prev[dayIdx] || { period: 1, duration: 60 }),
        [field]: val
      }
    }));
  };

  // STEP 2 SUBMISSION: Generate Schedule & Sessions
  const handleSaveStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedWeekdays.length === 0) {
      setGeneralMessage({ type: 'error', text: 'Please select at least one class day of the week.' });
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setGeneralMessage({ type: 'error', text: 'End date cannot be earlier than start date.' });
      return;
    }

    setSavingStep2(true);
    setGeneralMessage(null);
    setStep2SuccessMsg(null);

    try {
      const res = await apiFetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
          weekdays: selectedWeekdays,
          weekday_periods: weekdayPeriods,
          exclude_holidays: excludeHolidays
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate schedule sessions');

      setStep2SuccessMsg(`✅ ${data.message}`);
      await fetchScheduledSessions();
      setStep3Open(true);
    } catch (err: any) {
      setGeneralMessage({ type: 'error', text: err.message });
    } finally {
      setSavingStep2(false);
    }
  };

  // STEP 3: Save a single session from table view or list form
  const handleSaveSingleSession = (sess: ScheduledSession) => {
    if (sess.status === 'Saved' || sess.status === 'Updated') {
      setSessionToConfirmOverwrite(sess);
    } else {
      executeSaveSingleSession(sess);
    }
  };

  const executeSaveSingleSession = async (sess: ScheduledSession) => {
    setSavingSessionId(sess.sessionId || -1);
    setGeneralMessage(null);
    try {
      const res = await apiFetch('/api/schedule/save-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: [sess] })
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = Array.isArray(data.errors) ? data.errors.join(' | ') : (data.error || 'Failed to save session');
        throw new Error(errMsg);
      }

      setGeneralMessage({
        type: 'success',
        text: `✅ Attendance saved for ${sess.date} (Period P${sess.period}).`
      });
      fetchScheduledSessions();
    } catch (err: any) {
      setGeneralMessage({ type: 'error', text: err.message });
    } finally {
      setSavingSessionId(null);
      setSessionToConfirmOverwrite(null);
    }
  };

  // STEP 3: Save All Attendance in Table
  const handleSaveAllAttendance = () => {
    if (sessions.length === 0) {
      setGeneralMessage({ type: 'error', text: 'No scheduled sessions available to save.' });
      return;
    }
    const alreadySaved = sessions.some(s => s.status === 'Saved' || s.status === 'Updated');
    if (alreadySaved) {
      setConfirmOverwriteAll(true);
    } else {
      executeSaveAllAttendance();
    }
  };

  const executeSaveAllAttendance = async () => {
    setSavingAll(true);
    setConfirmOverwriteAll(false);
    setGeneralMessage(null);

    try {
      const res = await apiFetch('/api/schedule/save-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions })
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = Array.isArray(data.errors) ? data.errors.join(' | ') : (data.error || 'Failed to save all attendance');
        throw new Error(errMsg);
      }

      setGeneralMessage({
        type: 'success',
        text: `✅ All ${data.count} sessions saved successfully with exact session protection.`
      });
      fetchScheduledSessions();
      onRefresh();
    } catch (err: any) {
      setGeneralMessage({ type: 'error', text: err.message });
    } finally {
      setSavingAll(false);
    }
  };

  // STEP 3: Mark All Remaining as All Present
  const handleMarkAllRemainingPresent = async () => {
    setSavingAll(true);
    setConfirmMarkAllPresent(false);
    setGeneralMessage(null);

    try {
      const res = await apiFetch('/api/schedule/mark-all-present', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mark present');

      setGeneralMessage({
        type: 'success',
        text: `✅ Marked all remaining sessions as All Present for ${data.updatedSessions} sessions.`
      });
      fetchScheduledSessions();
      onRefresh();
    } catch (err: any) {
      setGeneralMessage({ type: 'error', text: err.message });
    } finally {
      setSavingAll(false);
    }
  };

  const normalizeRollKey = (val: unknown): string => {
    let s = String(val ?? '').trim();
    if (!s) return '';
    if (s.endsWith('.0')) s = s.slice(0, -2);
    if (/^\d+$/.test(s)) return String(parseInt(s, 10));
    return s.toLowerCase();
  };

  const getSessionUnknownRolls = (sess: ScheduledSession): string[] => {
    let combined = String(sess.absentInput || '').trim();
    if (sess.odInput?.trim() && !/od:/i.test(combined)) {
      combined = combined && combined.toLowerCase() !== 'p' ? `${combined}, OD: ${sess.odInput}` : `OD: ${sess.odInput}`;
    }
    if (sess.leaveInput?.trim() && !/\b(l:|leave:)/i.test(combined)) {
      combined = combined && combined.toLowerCase() !== 'p' ? `${combined}, L: ${sess.leaveInput}` : `L: ${sess.leaveInput}`;
    }
    const lower = combined.toLowerCase();
    if (!lower || ['p', 'present', 'all present', 'all', 'none', 'nil', 'h', 'holiday', 'od', 'on duty', 'on-duty'].includes(lower)) {
      return [];
    }
    const tokens = combined
      .replace(/;/g, ' , ')
      .replace(/(OD:|L:|A:|Leave:|Absent:|OnDuty:)/gi, ' $1 ')
      .split(/[,\s]+/)
      .map(t => t.trim())
      .filter(Boolean);

    const unknowns: string[] = [];
    for (const token of tokens) {
      const tLow = token.toLowerCase();
      if (['od:', 'onduty:', 'od', 'l:', 'leave:', 'l', 'a:', 'absent:', 'a', 'p', 'present'].includes(tLow)) {
        continue;
      }
      const matched = students.some(st => {
        const r = String(st.roll_no ?? '').trim();
        if (r) {
          return r.toLowerCase() === tLow || normalizeRollKey(r) === normalizeRollKey(token);
        }
        return String(st.reg_no ?? '').trim().toLowerCase() === tLow;
      });
      if (!matched && !unknowns.includes(token)) {
        unknowns.push(token);
      }
    }
    return unknowns;
  };

  // STEP 3: Delete single scheduled session
  const handleDeleteSession = async (sessionId?: number) => {
    if (!sessionId) return;
    try {
      const res = await apiFetch(`/api/schedule/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete session');
      fetchScheduledSessions();
    } catch (err: any) {
      setGeneralMessage({ type: 'error', text: err.message });
    }
  };

  // Update absent text for a session in state
  const handleUpdateSessionAbsent = (sessionNumber: number, val: string) => {
    setSessions(prev => {
      return prev.map(s => {
        if (s.sessionNumber === sessionNumber) {
          return { ...s, absentInput: val, status: 'Updated' };
        }
        return s;
      });
    });
  };

  // Filter sessions
  const filteredSessions = sessions.filter(s => {
    if (statusFilter === 'pending' && s.status !== 'Pending') return false;
    if (statusFilter === 'saved' && s.status === 'Pending') return false;
    if (tableSearch) {
      const term = tableSearch.toLowerCase();
      return (
        s.date.includes(term) ||
        s.day.toLowerCase().includes(term) ||
        s.subjectName.toLowerCase().includes(term) ||
        String(s.period).includes(term) ||
        s.absentInput.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Workflow Banner */}
      <div className="bg-white border border-[#9B8A79]/30 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#1E1E16] bg-[#E4E0D5] px-2 py-0.5 rounded-md">
              Step-by-Step Attendance Workflow
            </span>
            <span className="text-xs text-[#9B8A79] font-mono-numbers">
              Active: <strong>{activeDataset}</strong> ({students.length} Students)
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-[#1E1E16] tracking-tight mt-1">
            Complete Session-Based Attendance Engine
          </h1>
          <p className="text-xs text-[#9B8A79] mt-0.5 max-w-xl">
            Configure course parameters, define multi-period weekday schedules, generate authentic class sessions, mark spreadsheet attendance, and download official registers.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onNavigateToExport}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-[#1E1E16] bg-[#E4E0D5] border border-[#9B8A79]/30 hover:bg-[#F1F0EB] transition-all cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-[#1E1E16]" />
            <span>Export Reports</span>
          </button>
          <button
            type="button"
            onClick={fetchScheduledSessions}
            className="p-2 rounded-lg text-[#9B8A79] hover:text-[#1E1E16] hover:bg-[#F1F0EB] transition-colors border border-[#9B8A79]/30 cursor-pointer"
            title="Refresh Sessions"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {generalMessage && (
        <div className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-xs ${
          generalMessage.type === 'success'
            ? 'bg-[#E4E0D5] text-[#1E1E16] border-[#9B8A79]/40'
            : generalMessage.type === 'error'
            ? 'bg-[#A7674D] text-[#F1F0EB] border-[#1E1E16]'
            : 'bg-[#E4E0D5] text-[#1E1E16] border-[#9B8A79]/40'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{generalMessage.text}</span>
          </div>
          <button
            onClick={() => setGeneralMessage(null)}
            className="p-1 hover:opacity-70 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 1: STUDENT INFORMATION & COURSE DETAILS (EXPANDABLE) */}
      {/* ========================================================= */}
      <div className="bg-white border border-[#9B8A79]/30 rounded-xl shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => setStep1Open(!step1Open)}
          className="p-4 bg-[#E4E0D5] border-b border-[#9B8A79]/30 flex items-center justify-between cursor-pointer select-none hover:bg-[#F1F0EB] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1E1E16] text-white flex items-center justify-center font-bold text-xs">
              1
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#1E1E16]">
                Step 1: Upload Student Information & Course Details
              </h2>
              <p className="text-[11px] text-[#9B8A79]">
                Configure faculty identity, academic year, classroom/lab mode, and import student list (.xlsx, .csv).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              students.length > 0
                ? 'bg-[#E4E0D5] text-[#1E1E16]'
                : 'bg-[#A7674D] text-[#F1F0EB]'
            }`}>
              {students.length > 0 ? `${students.length} Students Imported` : 'No Students Uploaded'}
            </span>
            {step1Open ? <ChevronUp className="w-4 h-4 text-[#9B8A79]" /> : <ChevronDown className="w-4 h-4 text-[#9B8A79]" />}
          </div>
        </div>

        {step1Open && (
          <form onSubmit={handleSaveStep1} className="p-5 space-y-5">
            {step1SuccessMsg && (
              <div className="p-3 bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-lg text-xs text-[#1E1E16] flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{step1SuccessMsg}</span>
              </div>
            )}

            {/* Course & Faculty Identification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Faculty Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. A. Sharma"
                  value={facultyName}
                  onChange={(e) => setFacultyName(e.target.value)}
                  className="w-full text-xs font-medium px-2.5 py-2 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Department *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Information Science & Engineering"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full text-xs font-medium px-2.5 py-2 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Academic Year:
                </label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full text-xs font-medium px-2.5 py-2 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Year of Study:
                </label>
                <input
                  type="text"
                  value={yearOfStudy}
                  onChange={(e) => setYearOfStudy(e.target.value)}
                  className="w-full text-xs font-medium px-2.5 py-2 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Semester:
                </label>
                <input
                  type="text"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full text-xs font-medium px-2.5 py-2 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Class / Section:
                </label>
                <input
                  type="text"
                  value={classSection}
                  onChange={(e) => setClassSection(e.target.value)}
                  className="w-full text-xs font-medium px-2.5 py-2 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Subject Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Computer Networks"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  className="w-full text-xs font-medium px-2.5 py-2 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Total Subject Hours:
                </label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={totalHours}
                  onChange={(e) => setTotalHours(parseFloat(e.target.value) || 45)}
                  className="w-full text-xs font-medium px-2.5 py-2 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>
            </div>

            {/* Attendance Mode Selection (Classroom vs Lab) */}
            <div className="border-t border-[#9B8A79]/30 pt-4 space-y-2">
              <label className="block text-xs font-bold text-[#1E1E16] uppercase tracking-wide">
                Attendance Mode: Is this dataset for Classroom or Lab?
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div
                  onClick={() => setCourseType('classroom')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    courseType === 'classroom'
                      ? 'border-[#1E1E16] bg-[#E4E0D5]/60 shadow-xs ring-1 ring-[#1E1E16]'
                      : 'border-[#9B8A79]/30 bg-[#E4E0D5] hover:bg-[#F1F0EB]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#1E1E16] flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-[#1E1E16]" />
                      Classroom / Theory
                    </span>
                    <input
                      type="radio"
                      name="courseType"
                      checked={courseType === 'classroom'}
                      onChange={() => setCourseType('classroom')}
                      className="accent-[#1E1E16]"
                    />
                  </div>
                  <p className="text-[11px] text-[#9B8A79] leading-relaxed">
                    1 hour per class session. Attendance marks out of 5: <strong>1 mark reduced for every 3 classes absent</strong>.
                  </p>
                </div>

                <div
                  onClick={() => setCourseType('lab')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    courseType === 'lab'
                      ? 'border-[#1E1E16] bg-[#E4E0D5]/60 shadow-xs ring-1 ring-[#1E1E16]'
                      : 'border-[#9B8A79]/30 bg-[#E4E0D5] hover:bg-[#F1F0EB]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#1E1E16] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#1E1E16]" />
                      Laboratory / Practical
                    </span>
                    <input
                      type="radio"
                      name="courseType"
                      checked={courseType === 'lab'}
                      onChange={() => setCourseType('lab')}
                      className="accent-[#1E1E16]"
                    />
                  </div>
                  <p className="text-[11px] text-[#9B8A79] leading-relaxed">
                    3 hours per lab session. Attendance marks out of 5: <strong>1 mark reduced for every 1 day absent</strong>.
                  </p>
                </div>
              </div>
            </div>

            {/* Student File Upload & Validation Section */}
            <div className="border-t border-[#9B8A79]/30 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-[#1E1E16] uppercase tracking-wide">
                    Upload Student Roster (Excel / CSV)
                  </label>
                  <p className="text-[11px] text-[#9B8A79]">
                    Mandatory spreadsheet columns: <strong>S.No</strong>, <strong>Register Number</strong>, and <strong>Student Name</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadAuthenticatedFile('/api/templates/students.csv', 'students_template.csv')}
                  className="text-[11px] text-[#1E1E16] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Download Blank CSV Template</span>
                </button>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#9B8A79]/30 rounded-xl p-5 text-center cursor-pointer hover:bg-[#E4E0D5] transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload className="w-6 h-6 text-[#1E1E16] mx-auto mb-1.5" />
                <span className="text-xs font-bold text-[#1E1E16]">
                  {uploadedFile ? uploadedFile.name : 'Click to upload Student Excel / CSV file'}
                </span>
                <p className="text-[10px] text-[#9B8A79] mt-0.5">
                  Supported formats: .xlsx, .xls, .csv with genuine student rows.
                </p>
              </div>

              {/* Upload Validation Summary Card */}
              {importSummary && (
                <div className="bg-[#E4E0D5] border border-[#9B8A79]/30 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 bg-white rounded-lg border border-[#9B8A79]/30">
                      <span className="text-[10px] text-[#9B8A79] uppercase font-semibold">Total Rows</span>
                      <p className="text-base font-extrabold text-[#1E1E16] font-mono-numbers">{importSummary.total}</p>
                    </div>
                    <div className="p-2 bg-[#E4E0D5] rounded-lg border border-[#9B8A79]/40">
                      <span className="text-[10px] text-[#1E1E16] uppercase font-semibold">Valid</span>
                      <p className="text-base font-extrabold text-[#1E1E16] font-mono-numbers">{importSummary.validCount}</p>
                    </div>
                    <div className="p-2 bg-[#E4E0D5] rounded-lg border border-[#9B8A79]/40">
                      <span className="text-[10px] text-[#1E1E16] uppercase font-semibold">Duplicates</span>
                      <p className="text-base font-extrabold text-[#1E1E16] font-mono-numbers">{importSummary.duplicateCount}</p>
                    </div>
                    <div className="p-2 bg-[#A7674D] text-[#F1F0EB] rounded-lg border border-[#1E1E16]">
                      <span className="text-[10px] text-[#1E1E16] uppercase font-semibold">Invalid</span>
                      <p className="text-base font-extrabold text-[#1E1E16] font-mono-numbers">{importSummary.invalidCount}</p>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="max-h-48 overflow-y-auto border border-[#9B8A79]/30 rounded-lg bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#E4E0D5] text-[10px] font-bold text-[#9B8A79] uppercase border-b border-[#9B8A79]/30 sticky top-0">
                        <tr>
                          <th className="py-2 px-3 w-12 text-center">S.No</th>
                          <th className="py-2 px-3 w-24">Roll Number</th>
                          <th className="py-2 px-3 w-36">Register Number</th>
                          <th className="py-2 px-3">Student Name</th>
                          <th className="py-2 px-3 w-36 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#9B8A79]/20 font-mono-numbers text-[11px]">
                        {importSummary.rows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-[#E4E0D5]">
                            <td className="py-1.5 px-3 text-center text-[#9B8A79]">{r.sNo}</td>
                            <td className="py-1.5 px-3 font-bold text-[#1E1E16]">{r.rollNo || r.sNo}</td>
                            <td className="py-1.5 px-3 font-semibold text-[#1E1E16]">{r.regNo}</td>
                            <td className="py-1.5 px-3 font-sans text-[#1E1E16]">{r.name}</td>
                            <td className="py-1.5 px-3 text-center">
                              <span
                                title={r.error || ''}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.status === 'valid'
                                    ? 'bg-[#E4E0D5] text-[#1E1E16]'
                                    : 'bg-[#A7674D] text-[#F1F0EB]'
                                }`}
                              >
                                {r.status === 'valid' ? 'valid' : (r.error || r.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Destination Dataset Option: Existing vs New */}
            <div className="border-t border-[#9B8A79]/30 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs font-semibold text-[#1E1E16]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="existing"
                    checked={importMode === 'existing'}
                    onChange={() => setImportMode('existing')}
                    className="accent-[#1E1E16]"
                  />
                  <span>Save and Import to Existing Class ({activeDataset})</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="new"
                    checked={importMode === 'new'}
                    onChange={() => setImportMode('new')}
                    className="accent-[#1E1E16]"
                  />
                  <span>Create as New Dataset and Import</span>
                </label>
              </div>

              {importMode === 'new' && (
                <input
                  type="text"
                  required
                  placeholder="Enter New Class Name (e.g. ISE 4th Year B)"
                  value={newDatasetName}
                  onChange={(e) => setNewDatasetName(e.target.value)}
                  className="text-xs px-3 py-1.5 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16] w-full sm:w-64"
                />
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingStep1}
                className="px-6 py-2.5 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] disabled:opacity-50 transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {savingStep1 ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Course Details & Import Students</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ========================================================= */}
      {/* STEP 2: COURSE DATES & CLASS SCHEDULE (EXPANDABLE)        */}
      {/* ========================================================= */}
      <div className="bg-white border border-[#9B8A79]/30 rounded-xl shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => setStep2Open(!step2Open)}
          className="p-4 bg-[#E4E0D5] border-b border-[#9B8A79]/30 flex items-center justify-between cursor-pointer select-none hover:bg-[#F1F0EB] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1E1E16] text-white flex items-center justify-center font-bold text-xs">
              2
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#1E1E16]">
                Step 2: Course Dates & Class Schedule
              </h2>
              <p className="text-[11px] text-[#9B8A79]">
                Define academic calendar start/end date, select multiple class weekdays, and assign period & duration.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E4E0D5] text-[#1E1E16]">
              {selectedWeekdays.length} Day(s) Scheduled
            </span>
            {step2Open ? <ChevronUp className="w-4 h-4 text-[#9B8A79]" /> : <ChevronDown className="w-4 h-4 text-[#9B8A79]" />}
          </div>
        </div>

        {step2Open && (
          <form onSubmit={handleSaveStep2} className="p-5 space-y-5">
            {step2SuccessMsg && (
              <div className="p-3 bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-lg text-xs text-[#1E1E16] flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{step2SuccessMsg}</span>
              </div>
            )}

            {/* Date Range Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Course Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Course End Date *
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 text-xs text-[#1E1E16] font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeHolidays}
                    onChange={(e) => setExcludeHolidays(e.target.checked)}
                    className="accent-[#1E1E16] w-4 h-4 rounded"
                  />
                  <span>Exclude declared institutional holidays</span>
                </label>
              </div>
            </div>

            {/* Class Days of Week (Multi-Select) */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-[#1E1E16] uppercase tracking-wide">
                Class Days of Week (Select multiple, e.g. Monday & Thursday):
              </label>
              <div className="flex flex-wrap gap-2">
                {weekdayNames.map((name, idx) => {
                  const isSelected = selectedWeekdays.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleWeekday(idx)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-[#A7674D] text-[#F1F0EB] border-[#1E1E16] shadow-xs'
                          : 'bg-white text-[#9B8A79] border-[#9B8A79]/30 hover:bg-[#E4E0D5]'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Period Configuration per Weekday */}
            {selectedWeekdays.length > 0 && (
              <div className="border border-[#9B8A79]/30 rounded-xl p-4 bg-[#E4E0D5] space-y-3">
                <h4 className="text-xs font-bold text-[#1E1E16] uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#1E1E16]" />
                  <span>Period Configuration per Weekday</span>
                </h4>
                <p className="text-[11px] text-[#9B8A79]">
                  Assign distinct period numbers and durations for each selected day (e.g. Monday: Period 1, Thursday: Period 4).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selectedWeekdays.map((dayIdx) => {
                    const cfg = weekdayPeriods[dayIdx] || { period: 1, duration: 60 };
                    return (
                      <div key={dayIdx} className="p-3 bg-white border border-[#9B8A79]/30 rounded-lg space-y-2">
                        <span className="text-xs font-bold text-[#1E1E16] block border-b border-[#9B8A79]/30 pb-1">
                          {weekdayNames[dayIdx]}
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="block text-[10px] text-[#9B8A79] font-semibold mb-0.5">Period:</label>
                            <select
                              value={cfg.period || 1}
                              onChange={(e) => updateWeekdayPeriod(dayIdx, 'period', parseInt(e.target.value, 10))}
                              className="w-full text-xs font-semibold px-2 py-1.5 bg-[#E4E0D5] border border-[#9B8A79]/30 rounded text-[#1E1E16]"
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8].map(p => (
                                <option key={p} value={p}>Period {p}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#9B8A79] font-semibold mb-0.5">Duration (mins):</label>
                            <input
                              type="number"
                              min="30"
                              max="240"
                              step="15"
                              value={cfg.duration || 60}
                              onChange={(e) => updateWeekdayPeriod(dayIdx, 'duration', parseInt(e.target.value, 10) || 60)}
                              className="w-full text-xs font-semibold px-2 py-1.5 bg-[#E4E0D5] border border-[#9B8A79]/30 rounded text-[#1E1E16]"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingStep2}
                className="px-6 py-2.5 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] disabled:opacity-50 transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {savingStep2 ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Calendar className="w-3.5 h-3.5" />
                )}
                <span>Save Schedule & Proceed to Attendance Marking</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ========================================================= */}
      {/* STEP 3: FULL SCHEDULE ATTENDANCE SHEET (SPREADSHEET VIEW) */}
      {/* ========================================================= */}
      <div className="bg-white border border-[#9B8A79]/30 rounded-xl shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => setStep3Open(!step3Open)}
          className="p-4 bg-[#E4E0D5] border-b border-[#9B8A79]/30 flex items-center justify-between cursor-pointer select-none hover:bg-[#F1F0EB] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1E1E16] text-white flex items-center justify-center font-bold text-xs">
              3
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#1E1E16]">
                Full Schedule Attendance Sheet
              </h2>
              <p className="text-[11px] text-[#9B8A79]">
                Spreadsheet-style multi-session attendance editor. Enter absent roll numbers per session or mark all present.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E4E0D5] text-[#1E1E16] border border-[#9B8A79]/30 font-mono-numbers">
              {sessions.length} Generated Sessions
            </span>
            {step3Open ? <ChevronUp className="w-4 h-4 text-[#9B8A79]" /> : <ChevronDown className="w-4 h-4 text-[#9B8A79]" />}
          </div>
        </div>

        {step3Open && (
          <div className="p-5 space-y-4">
            {/* Action Bar: Controls, Mode Switcher, Save All, Mark All Present */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#9B8A79]/30 pb-3">
              <div className="flex items-center gap-2">
                {/* View Switcher: Table View vs List Form View */}
                <div className="inline-flex rounded-lg border border-[#9B8A79]/30 bg-[#E4E0D5] p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      viewMode === 'table'
                        ? 'bg-[#A7674D] text-[#F1F0EB] shadow-xs'
                        : 'text-[#9B8A79] hover:text-[#1E1E16]'
                    }`}
                  >
                    Spreadsheet Table View
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('form')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      viewMode === 'form'
                        ? 'bg-[#A7674D] text-[#F1F0EB] shadow-xs'
                        : 'text-[#9B8A79] hover:text-[#1E1E16]'
                    }`}
                  >
                    List Form View
                  </button>
                </div>

                {/* Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="text-xs px-2.5 py-1.5 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16]"
                >
                  <option value="all">All Sessions ({sessions.length})</option>
                  <option value="pending">Pending Only</option>
                  <option value="saved">Saved / Updated Only</option>
                </select>
              </div>

              {/* Working Master Buttons: Save All Attendance & Mark All Present */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmMarkAllPresent(true)}
                  disabled={savingAll || sessions.length === 0}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold text-[#1E1E16] bg-[#E4E0D5] border border-[#9B8A79]/40 hover:bg-[#1E1E16] hover:text-white transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  Mark All Remaining as All Present
                </button>

                <button
                  type="button"
                  onClick={handleSaveAllAttendance}
                  disabled={savingAll || sessions.length === 0}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all disabled:opacity-50 shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  {savingAll ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save All Attendance</span>
                </button>
              </div>
            </div>

            {/* Confirmation Modal for Mark All Present */}
            {confirmMarkAllPresent && (
              <div className="fixed inset-0 z-50 bg-[#1E1E16]/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white border border-[#9B8A79]/40 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#E4E0D5] text-[#1E1E16] flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1E1E16]">
                        Confirm Mark All Remaining as Present?
                      </h3>
                      <p className="text-xs text-[#9B8A79] mt-0.5">
                        This action will mark all active students Present for all generated sessions in this schedule.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setConfirmMarkAllPresent(false)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-[#9B8A79] hover:bg-[#E4E0D5] border border-[#9B8A79]/30 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleMarkAllRemainingPresent}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all cursor-pointer shadow-md"
                    >
                      Yes, Mark All Present
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Confirmation Modal for Overwrite Single Session */}
            {sessionToConfirmOverwrite && (
              <div className="fixed inset-0 z-50 bg-[#1E1E16]/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white border border-[#9B8A79]/40 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#E4E0D5] text-[#A7674D] flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1E1E16]">
                        Confirm Overwrite Saved Attendance?
                      </h3>
                      <p className="text-xs text-[#9B8A79] mt-0.5">
                        This session on <strong>{sessionToConfirmOverwrite.date} (Period P{sessionToConfirmOverwrite.period})</strong> already has saved attendance records. Do you want to overwrite it with current inputs?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSessionToConfirmOverwrite(null)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-[#9B8A79] hover:bg-[#E4E0D5] border border-[#9B8A79]/30 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => executeSaveSingleSession(sessionToConfirmOverwrite)}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all cursor-pointer shadow-md"
                    >
                      Yes, Overwrite & Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Confirmation Modal for Overwrite All Sessions */}
            {confirmOverwriteAll && (
              <div className="fixed inset-0 z-50 bg-[#1E1E16]/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white border border-[#9B8A79]/40 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#E4E0D5] text-[#A7674D] flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1E1E16]">
                        Confirm Overwrite All Saved Sessions?
                      </h3>
                      <p className="text-xs text-[#9B8A79] mt-0.5">
                        One or more sessions in this schedule already have saved attendance records. Do you want to proceed and overwrite existing attendance records?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setConfirmOverwriteAll(false)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-[#9B8A79] hover:bg-[#E4E0D5] border border-[#9B8A79]/30 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={executeSaveAllAttendance}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all cursor-pointer shadow-md"
                    >
                      Yes, Overwrite & Save All
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 1: SPREADSHEET TABLE VIEW */}
            {viewMode === 'table' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[#9B8A79]">
                  <span>
                    Showing <strong>{filteredSessions.length}</strong> of {sessions.length} class sessions. Enter student roll numbers separated by commas.
                  </span>
                  <div className="relative w-56">
                    <Search className="w-3.5 h-3.5 text-[#9B8A79] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search dates, periods..."
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-2.5 py-1 bg-white border border-[#9B8A79]/30 rounded text-[#1E1E16]"
                    />
                  </div>
                </div>

                {/* Clear accepted inputs helper banner */}
                <div className="p-3 rounded-xl bg-[#E4E0D5]/70 border border-[#9B8A79]/30 text-xs text-[#1E1E16] flex flex-wrap items-center justify-between gap-2 shadow-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[#A7674D] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#A7674D]" />
                      Accepted inputs:
                    </span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#9B8A79]/30 text-[#1E1E16] font-semibold">"23, 35, 42"</span> <span className="text-[#9B8A79]">(absent)</span>
                    <span className="text-[#9B8A79]">|</span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#9B8A79]/30 text-[#1E1E16] font-semibold">"P"</span> <span className="text-[#9B8A79]">(all present)</span>
                    <span className="text-[#9B8A79]">|</span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#9B8A79]/30 text-[#1E1E16] font-semibold">"H" or "Holiday"</span> <span className="text-[#9B8A79]">(holiday)</span>
                    <span className="text-[#9B8A79]">|</span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#9B8A79]/30 text-[#1E1E16] font-semibold">"OD: 23, 35"</span> <span className="text-[#9B8A79]">(on duty)</span>
                    <span className="text-[#9B8A79]">|</span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#9B8A79]/30 text-[#1E1E16] font-semibold">"23, 35, OD: 42"</span> <span className="text-[#9B8A79]">(combined)</span>
                  </div>
                </div>

                <div className="border border-[#9B8A79]/30 rounded-xl overflow-x-auto bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#E4E0D5] text-[#1E1E16] font-bold text-[11px] uppercase tracking-wider border-b border-[#9B8A79]/30">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3 w-36">Date & Day</th>
                        <th className="py-2.5 px-3 w-40">Subject</th>
                        <th className="py-2.5 px-3 w-20 text-center">Period</th>
                        <th className="py-2.5 px-3">Absent Roll Numbers</th>
                        <th className="py-2.5 px-3 w-24 text-center">Status</th>
                        <th className="py-2.5 px-3 w-28 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#9B8A79]/20 font-mono-numbers text-[11px]">
                      {filteredSessions.length > 0 ? (
                        filteredSessions.map((sess, idx) => {
                          const rowUnknownRolls = getSessionUnknownRolls(sess);
                          return (
                          <tr key={sess.sessionId || idx} className="hover:bg-[#E4E0D5] transition-colors">
                            <td className="py-2 px-3 text-center text-[#9B8A79]">
                              {sess.sessionNumber}
                            </td>
                            <td className="py-2 px-3 font-semibold text-[#1E1E16]">
                              {sess.date} <span className="text-[10px] text-[#9B8A79] font-sans">({sess.day})</span>
                            </td>
                            <td className="py-2 px-3 font-sans text-[#1E1E16] truncate max-w-[150px]">
                              {sess.subjectName || subjectName || 'Classroom'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className="px-2 py-0.5 rounded bg-[#E4E0D5] border border-[#9B8A79]/30 font-bold text-[#1E1E16]">
                                P{sess.period}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                placeholder="e.g. 23, 35, 42 | P | H | OD: 23"
                                value={sess.absentInput}
                                onChange={(e) => handleUpdateSessionAbsent(sess.sessionNumber, e.target.value)}
                                className={`w-full text-xs font-mono px-2 py-1 bg-[#E4E0D5] border rounded focus:bg-white focus:outline-none text-[#1E1E16] ${
                                  rowUnknownRolls.length > 0
                                    ? 'border-[#A7674D] ring-1 ring-[#A7674D]'
                                    : 'border-[#9B8A79]/30 focus:border-[#1E1E16]'
                                }`}
                              />
                              {rowUnknownRolls.length > 0 && (
                                <p className="text-[10px] font-sans font-semibold text-[#A7674D] mt-0.5">
                                  Unknown Roll Number(s): {rowUnknownRolls.join(', ')}
                                </p>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                sess.status === 'Saved'
                                  ? 'bg-[#E4E0D5] text-[#1E1E16]'
                                  : sess.status === 'Updated'
                                  ? 'bg-[#E4E0D5] text-[#1E1E16]'
                                  : 'bg-[#E4E0D5] text-[#9B8A79] border border-[#9B8A79]/30'
                              }`}>
                                {sess.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1 font-sans">
                                <button
                                  type="button"
                                  onClick={() => handleSaveSingleSession(sess)}
                                  disabled={savingSessionId === sess.sessionId}
                                  title="Save this session"
                                  className="p-1 text-[#1E1E16] hover:bg-[#E4E0D5] rounded cursor-pointer transition-colors"
                                >
                                  {savingSessionId === sess.sessionId ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Save className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveFormSessionIndex(idx);
                                    setViewMode('form');
                                  }}
                                  title="Open in List View"
                                  className="p-1 text-[#9B8A79] hover:text-[#1E1E16] hover:bg-[#E4E0D5] rounded cursor-pointer transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSession(sess.sessionId)}
                                  title="Delete scheduled session"
                                  className="p-1 text-[#9B8A79] hover:text-[#1E1E16] hover:bg-[#A7674D] text-[#F1F0EB] rounded cursor-pointer transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-xs text-[#9B8A79]">
                            {sessions.length === 0
                              ? 'No class sessions generated yet. Configure dates and schedule in Step 2 above.'
                              : 'No sessions match your filter query.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* VIEW 2: LIST FORM VIEW */
              <div className="border border-[#9B8A79]/30 rounded-xl p-5 bg-[#E4E0D5] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#9B8A79]/30 pb-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-[#1E1E16]">Select Session:</label>
                    <select
                      value={activeFormSessionIndex}
                      onChange={(e) => setActiveFormSessionIndex(parseInt(e.target.value, 10))}
                      className="text-xs font-semibold px-2.5 py-1.5 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16]"
                    >
                      {sessions.map((s, i) => (
                        <option key={s.sessionId || i} value={i}>
                          #{s.sessionNumber}: {s.date} ({s.day}) — Period P{s.period} [{s.status}]
                        </option>
                      ))}
                    </select>
                  </div>

                  {sessions[activeFormSessionIndex] && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveSingleSession(sessions[activeFormSessionIndex])}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Session #{sessions[activeFormSessionIndex].sessionNumber}</span>
                      </button>
                    </div>
                  )}
                </div>

                {sessions[activeFormSessionIndex] && (
                  <div className="space-y-4">
                    {/* Session Quick-Entry Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                          Absent Roll Numbers:
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 23, 35, 42 | P | H | OD: 23"
                          value={sessions[activeFormSessionIndex].absentInput}
                          onChange={(e) => handleUpdateSessionAbsent(sessions[activeFormSessionIndex].sessionNumber, e.target.value)}
                          className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16]"
                        />
                        {getSessionUnknownRolls(sessions[activeFormSessionIndex]).length > 0 && (
                          <p className="text-[10px] font-semibold text-[#A7674D] mt-1">
                            Unknown Roll Number(s): {getSessionUnknownRolls(sessions[activeFormSessionIndex]).join(', ')}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                          On Duty (OD) Roll Numbers:
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 23, 35"
                          value={sessions[activeFormSessionIndex].odInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSessions(prev => {
                              const next = [...prev];
                              next[activeFormSessionIndex] = { ...next[activeFormSessionIndex], odInput: val, status: 'Updated' };
                              return next;
                            });
                          }}
                          className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                          Leave Roll Numbers:
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 15, 20"
                          value={sessions[activeFormSessionIndex].leaveInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSessions(prev => {
                              const next = [...prev];
                              next[activeFormSessionIndex] = { ...next[activeFormSessionIndex], leaveInput: val, status: 'Updated' };
                              return next;
                            });
                          }}
                          className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-[#9B8A79]/30 rounded-lg text-[#1E1E16]"
                        />
                      </div>
                    </div>

                    {/* Interactive Student Roster Grid */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-[#9B8A79]">
                        Click on any student card below to cycle attendance status: <strong>P → A → OD → L → P</strong>
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-72 overflow-y-auto pr-1">
                        {students.map((s) => {
                          const status = formStudentStatuses[s.reg_no] || 'P';
                          const badgeStyles: Record<string, { bg: string; text: string; border: string }> = {
                            P: { bg: 'bg-[#E4E0D5]', text: 'text-[#1E1E16]', border: 'border-[#9B8A79]/40' },
                            A: { bg: 'bg-[#A7674D] text-[#F1F0EB]', text: 'text-[#1E1E16]', border: 'border-[#1E1E16]' },
                            OD: { bg: 'bg-[#E4E0D5]', text: 'text-[#1E1E16]', border: 'border-[#9B8A79]/40' },
                            L: { bg: 'bg-[#E4E0D5]', text: 'text-[#9B8A79]', border: 'border-[#9B8A79]/40' }
                          };
                          const style = badgeStyles[status];

                          return (
                            <div
                              key={s.id}
                              onClick={() => {
                                const nextStatusMap: Record<string, 'P' | 'A' | 'OD' | 'L'> = {
                                  P: 'A',
                                  A: 'OD',
                                  OD: 'L',
                                  L: 'P'
                                };
                                const next = nextStatusMap[status];
                                const newStatuses = { ...formStudentStatuses, [s.reg_no]: next };
                                setFormStudentStatuses(newStatuses);

                                // Sync back to session absentInput string using roll numbers
                                const abs = students.filter(st => newStatuses[st.reg_no] === 'A').map(st => st.roll_no || st.reg_no);
                                const ods = students.filter(st => newStatuses[st.reg_no] === 'OD').map(st => st.roll_no || st.reg_no);
                                const lvs = students.filter(st => newStatuses[st.reg_no] === 'L').map(st => st.roll_no || st.reg_no);

                                let statusInput = 'P';
                                if (abs.length > 0 && ods.length > 0) {
                                  statusInput = `${abs.join(', ')}, OD: ${ods.join(', ')}`;
                                } else if (abs.length > 0) {
                                  statusInput = abs.join(', ');
                                } else if (ods.length > 0) {
                                  statusInput = `OD: ${ods.join(', ')}`;
                                }

                                setSessions(prev => {
                                  const n = [...prev];
                                  n[activeFormSessionIndex] = {
                                    ...n[activeFormSessionIndex],
                                    absentInput: statusInput,
                                    odInput: ods.join(', '),
                                    leaveInput: lvs.join(', '),
                                    status: 'Updated'
                                  };
                                  return n;
                                });
                              }}
                              className={`p-2 rounded-lg border transition-all cursor-pointer select-none flex flex-col justify-between ${style.bg} ${style.border} hover:shadow-xs`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] font-bold text-[#1E1E16] truncate">
                                  Roll #{s.roll_no || s.reg_no}
                                </span>
                                <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded ${style.text}`}>
                                  {status}
                                </span>
                              </div>
                              <p className="text-[11px] font-semibold text-[#1E1E16] truncate mt-1">
                                {s.name}
                              </p>
                              <span className="text-[9px] text-[#9B8A79] font-mono truncate">
                                {s.reg_no}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
