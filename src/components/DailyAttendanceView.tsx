import React, { useState, useEffect } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  CalendarOff,
  UserCheck,
  UserX,
  Sparkles,
  Info,
  BookOpen,
  Briefcase,
  FileText
} from 'lucide-react';
import { Student } from '../types';
import { apiFetch } from '../authClient';

interface DailyAttendanceViewProps {
  activeDataset: string;
}

type StatusType = 'P' | 'A' | 'OD' | 'L';

const normalizeRollKey = (val: unknown): string => {
  let s = String(val ?? '').trim();
  if (!s) return '';
  if (s.endsWith('.0')) s = s.slice(0, -2);
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s.toLowerCase();
};

export const DailyAttendanceView: React.FC<DailyAttendanceViewProps> = ({ activeDataset }) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1);
  const [periodDuration, setPeriodDuration] = useState<number>(60);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | ''>('');
  const [absentInput, setAbsentInput] = useState<string>('');
  const [odInput, setOdInput] = useState<string>('');
  const [leaveInput, setLeaveInput] = useState<string>('');
  const [isHoliday, setIsHoliday] = useState<boolean>(false);
  const [holidayDesc, setHolidayDesc] = useState<string>('');
  const [exists, setExists] = useState<boolean>(false);
  const [assignedPeriods, setAssignedPeriods] = useState<{ period_no: number; subject_id: number; subject_name: string }[]>([]);
  const [allSessionsForDate, setAllSessionsForDate] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentStatuses, setStudentStatuses] = useState<Record<string, StatusType>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Load attendance data whenever selectedDate, selectedPeriod, or activeDataset changes
  const fetchAttendance = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/attendance/daily?date=${selectedDate}&period=${selectedPeriod}&subject_id=${selectedSubjectId || ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch attendance');

      setIsHoliday(data.isHoliday);
      setHolidayDesc(data.holidayDescription || '');
      setExists(data.exists);
      setAssignedPeriods(data.assignedPeriods || []);
      setAllSessionsForDate(data.allSessionsForDate || []);
      setSubjects(data.subjects || []);
      setStudents(data.students || []);

      // Build status map from students returned
      const statusMap: Record<string, StatusType> = {};
      const absents: string[] = [];
      const ods: string[] = [];
      const leaves: string[] = [];

      (data.students || []).forEach((s: any) => {
        const idKey = String(s.roll_no || s.reg_no);
        const st: StatusType = (s.status === 'A' || s.status === 'OD' || s.status === 'L') ? s.status : 'P';
        statusMap[idKey] = st;
        if (st === 'A') absents.push(idKey);
        else if (st === 'OD') ods.push(idKey);
        else if (st === 'L') leaves.push(idKey);
      });

      setStudentStatuses(statusMap);

      if (data.exists) {
        setAbsentInput(absents.join(', '));
        setOdInput(ods.join(', '));
        setLeaveInput(leaves.join(', '));
      } else {
        setAbsentInput('');
        setOdInput('');
        setLeaveInput('');
      }

      // Default subject selection if timetable specifies
      if (data.assignedPeriods?.length > 0) {
        const match = data.assignedPeriods.find((p: any) => p.period_no === selectedPeriod);
        if (match) setSelectedSubjectId(match.subject_id);
      } else if (data.subjects?.length > 0 && selectedSubjectId === '') {
        setSelectedSubjectId(data.subjects[0].id);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [selectedDate, selectedPeriod, activeDataset]);

  // Derive weekday name
  const d = new Date(selectedDate);
  const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekdayName = weekdayNames[(d.getDay() + 6) % 7];

  // Build roll lookup for active students (Roll Number primary, separate from Register Number)
  const parseRollTokens = (text: string): string[] =>
    text
      .split(/[,\s;\n]+/)
      .map(t => t.trim())
      .filter(Boolean);

  const matchesStudentRoll = (student: Student, token: string): boolean => {
    const rollStr = String(student.roll_no ?? '').trim();
    if (rollStr) {
      return rollStr.toLowerCase() === token.toLowerCase() || normalizeRollKey(rollStr) === normalizeRollKey(token);
    }
    const regStr = String(student.reg_no ?? '').trim();
    return regStr.toLowerCase() === token.toLowerCase();
  };

  const getUnknownRollsFromText = (text: string, allowHolidayKeyword = false): string[] => {
    const tokens = parseRollTokens(text);
    const ignored = new Set(['p', 'present', 'none', 'nil', 'all']);
    if (allowHolidayKeyword) {
      ignored.add('h');
      ignored.add('holiday');
    }
    const unknowns: string[] = [];
    for (const tok of tokens) {
      if (ignored.has(tok.toLowerCase())) continue;
      const found = students.some(s => matchesStudentRoll(s, tok));
      if (!found && !unknowns.includes(tok)) {
        unknowns.push(tok);
      }
    }
    return unknowns;
  };

  const unknownAbsentRolls = isHoliday ? [] : getUnknownRollsFromText(absentInput, true);
  const unknownOdRolls = isHoliday ? [] : getUnknownRollsFromText(odInput, false);
  const unknownLeaveRolls = isHoliday ? [] : getUnknownRollsFromText(leaveInput, false);
  const allUnknownRolls = Array.from(new Set([...unknownAbsentRolls, ...unknownOdRolls, ...unknownLeaveRolls]));

  // Recompute studentStatuses whenever any of the 3 quick-entry inputs change
  const syncStatusesFromInputs = (absTxt: string, odTxt: string, lvTxt: string) => {
    const absTokens = parseRollTokens(absTxt).filter(t => !['p', 'present', 'none', 'nil', 'h', 'holiday'].includes(t.toLowerCase()));
    const odTokens = parseRollTokens(odTxt).filter(t => !['p', 'present', 'none', 'nil'].includes(t.toLowerCase()));
    const lvTokens = parseRollTokens(lvTxt).filter(t => !['p', 'present', 'none', 'nil'].includes(t.toLowerCase()));

    const next: Record<string, StatusType> = {};
    students.forEach(s => {
      const idKey = String(s.roll_no || s.reg_no);
      if (absTokens.some(tok => matchesStudentRoll(s, tok))) {
        next[idKey] = 'A';
      } else if (odTokens.some(tok => matchesStudentRoll(s, tok))) {
        next[idKey] = 'OD';
      } else if (lvTokens.some(tok => matchesStudentRoll(s, tok))) {
        next[idKey] = 'L';
      } else {
        next[idKey] = 'P';
      }
    });
    setStudentStatuses(next);
  };

  // Helper: sync status when quick-entry inputs change
  const handleAbsentTextChange = (text: string) => {
    setAbsentInput(text);
    syncStatusesFromInputs(text, odInput, leaveInput);
  };

  const handleOdTextChange = (text: string) => {
    setOdInput(text);
    syncStatusesFromInputs(absentInput, text, leaveInput);
  };

  const handleLeaveTextChange = (text: string) => {
    setLeaveInput(text);
    syncStatusesFromInputs(absentInput, odInput, text);
  };

  // Toggle student status by clicking card (P -> A -> OD -> L -> P)
  const cycleStudentStatus = (identifier: string) => {
    const current = studentStatuses[identifier] || 'P';
    let next: StatusType = 'P';
    if (current === 'P') next = 'A';
    else if (current === 'A') next = 'OD';
    else if (current === 'OD') next = 'L';
    else next = 'P';

    const newStatuses = { ...studentStatuses, [identifier]: next };
    setStudentStatuses(newStatuses);

    // Reconstruct input strings
    const absents: string[] = [];
    const ods: string[] = [];
    const leaves: string[] = [];

    students.forEach(s => {
      const id = String(s.roll_no || s.reg_no);
      const st = newStatuses[id] || 'P';
      if (st === 'A') absents.push(id);
      else if (st === 'OD') ods.push(id);
      else if (st === 'L') leaves.push(id);
    });

    setAbsentInput(absents.join(', '));
    setOdInput(ods.join(', '));
    setLeaveInput(leaves.join(', '));
  };

  // Summary counts
  let presentCount = 0;
  let absentCount = 0;
  let odCount = 0;
  let leaveCount = 0;

  students.forEach(s => {
    const id = String(s.roll_no || s.reg_no);
    const st = studentStatuses[id] || 'P';
    if (st === 'A') absentCount++;
    else if (st === 'OD') odCount++;
    else if (st === 'L') leaveCount++;
    else presentCount++;
  });

  const handleAllPresent = () => {
    const next: Record<string, StatusType> = {};
    students.forEach(s => {
      next[String(s.roll_no || s.reg_no)] = 'P';
    });
    setStudentStatuses(next);
    setAbsentInput('');
    setOdInput('');
    setLeaveInput('');
    setIsHoliday(false);
    setMessage({ type: 'info', text: 'All students set to Present.' });
  };

  const handleSaveAttendance = async () => {
    if (!isHoliday && allUnknownRolls.length > 0) {
      setMessage({
        type: 'error',
        text: `Unknown Roll Number(s): ${allUnknownRolls.join(', ')}. Please enter valid student roll numbers from this class.`
      });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/attendance/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendance_date: selectedDate,
          period_no: selectedPeriod,
          period_duration: periodDuration,
          subject_id: selectedSubjectId || null,
          absent_text: isHoliday ? 'holiday' : absentInput,
          od_text: odInput,
          leave_text: leaveInput,
          replace: true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save attendance');

      setMessage({
        type: 'success',
        text: isHoliday
          ? `Date ${selectedDate} marked as Holiday successfully.`
          : `Session attendance for ${selectedDate} (P${selectedPeriod}) saved! Present: ${data.present}, Absent: ${data.absent}, OD: ${data.od || 0}, Leave: ${data.leave || 0}.`
      });
      setExists(true);
      fetchAttendance();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert / Feedback message */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-[#E4E0D5] border-[#9B8A79]/40 text-[#1E1E16]'
              : message.type === 'error'
              ? 'bg-[#F5DDD4] border-[#1E1E16] text-[#1E1E16]'
              : 'bg-[#E4E0D5] border-[#9B8A79]/40 text-[#1E1E16]'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-xs font-bold px-1.5 py-0.5 rounded-md hover:bg-black/5"
          >
            ✕
          </button>
        </div>
      )}

      {/* STEP 01 – Select Class, Date, Period & Subject */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#A7674D] text-[#F1F0EB] flex items-center justify-center text-xs font-bold">
              1
            </span>
            <h3 className="text-sm font-bold text-[#1E1E16] uppercase tracking-wide">
              Step 01 — Select Class, Date, Period & Course
            </h3>
          </div>
          <span className="text-xs text-[#9B8A79] font-semibold font-mono-numbers">
            {weekdayName} • {selectedDate}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Active Class */}
          <div>
            <label className="block text-[11px] font-bold text-[#9B8A79] uppercase tracking-wider mb-1">
              Class / Section
            </label>
            <div className="px-3 py-2 bg-[#F1F0EB]/40 border border-[#9B8A79]/40 rounded-lg text-xs font-bold text-[#1E1E16] truncate">
              {activeDataset}
            </div>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-[11px] font-bold text-[#9B8A79] uppercase tracking-wider mb-1">
              Attendance Date *
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full text-xs font-mono-numbers px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
            />
          </div>

          {/* Period Selector (1 to 8) */}
          <div>
            <label className="block text-[11px] font-bold text-[#9B8A79] uppercase tracking-wider mb-1">
              Period Slot *
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(parseInt(e.target.value, 10))}
              className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map(p => {
                const isAssigned = assignedPeriods.some(ap => ap.period_no === p);
                const hasSaved = allSessionsForDate.some(s => s.period_number === p);
                return (
                  <option key={p} value={p}>
                    Period {p} (P{p}) {isAssigned ? '★ Timetable' : ''} {hasSaved ? '• Saved' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Subject Assignment */}
          <div>
            <label className="block text-[11px] font-bold text-[#9B8A79] uppercase tracking-wider mb-1">
              Course / Subject
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
            >
              {subjects.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code || s.name})
                </option>
              ))}
            </select>
          </div>

          {/* Period Duration */}
          <div>
            <label className="block text-[11px] font-bold text-[#9B8A79] uppercase tracking-wider mb-1">
              Duration (Mins)
            </label>
            <input
              type="number"
              min="30"
              max="180"
              step="5"
              value={periodDuration}
              onChange={(e) => setPeriodDuration(parseInt(e.target.value, 10) || 60)}
              className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
            />
          </div>
        </div>

        {/* Timetable Period Banner & Holiday Toggle */}
        <div className="mt-3.5 p-2.5 bg-[#F1F0EB]/40 border border-[#9B8A79]/40 rounded-lg flex flex-wrap items-center justify-between text-xs text-[#1E1E16]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#1E1E16]" />
            {assignedPeriods.length > 0 ? (
              <span>
                <strong>{weekdayName} Timetable:</strong>{' '}
                {assignedPeriods.map(p => (
                  <button
                    key={p.period_no}
                    type="button"
                    onClick={() => setSelectedPeriod(p.period_no)}
                    className={`ml-1 px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                      selectedPeriod === p.period_no
                        ? 'bg-[#A7674D] text-[#F1F0EB]'
                        : 'bg-white border border-[#9B8A79]/40 text-[#1E1E16] hover:bg-[#6C6B50] text-[#F1F0EB]/20'
                    }`}
                  >
                    P{p.period_no} ({p.subject_name})
                  </button>
                ))}
              </span>
            ) : (
              <span className="text-[#9B8A79]">
                No timetable scheduled for {weekdayName}. You can mark any period (P1–P8) freely.
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsHoliday(!isHoliday)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              isHoliday
                ? 'bg-[#6C6B50] text-[#F1F0EB] text-white shadow-xs'
                : 'bg-white border border-[#9B8A79]/40 text-[#1E1E16] hover:bg-[#F1F0EB]/20'
            }`}
          >
            <CalendarOff className="w-3.5 h-3.5" />
            <span>{isHoliday ? 'Holiday Marked' : 'Mark as Holiday'}</span>
          </button>
        </div>
      </div>

      {/* STEP 02 – Quick Entry for Absent, OD (On Duty) & Leave */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#A7674D] text-[#F1F0EB] flex items-center justify-center text-xs font-bold">
              2
            </span>
            <h3 className="text-sm font-bold text-[#1E1E16] uppercase tracking-wide">
              Step 02 — Status Quick-Entry (Absent, OD, Leave)
            </h3>
          </div>

          {/* Live Summary Counters */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono-numbers">
            <span className="px-2.5 py-1 rounded-md bg-white border border-[#9B8A79]/40 text-[#1E1E16] font-medium">
              Total: <strong>{students.length}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-md bg-[#E4E0D5] border border-[#9B8A79]/40 text-[#1E1E16] font-bold">
              Present: <strong>{presentCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-md bg-[#F5DDD4] border border-[#1E1E16] text-[#1E1E16] font-bold">
              Absent: <strong>{absentCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-md bg-[#E4E0D5] border border-[#9B8A79]/40 text-[#1E1E16] font-bold">
              OD: <strong>{odCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-md bg-[#E4E0D5] border border-[#9B8A79]/40 text-[#6C6B50] font-bold">
              Leave: <strong>{leaveCount}</strong>
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#1E1E16] flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#A7674D]" />
              Absent Roll Numbers
            </label>
            <button
              type="button"
              onClick={handleAllPresent}
              className="text-xs text-[#1E1E16] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mark All Present</span>
            </button>
          </div>

          <textarea
            rows={2}
            disabled={isHoliday}
            placeholder="e.g. 3, 7, 14, 22"
            value={absentInput}
            onChange={(e) => handleAbsentTextChange(e.target.value)}
            className={`w-full text-xs font-mono p-2.5 bg-white border rounded-lg text-[#1E1E16] placeholder:text-[#9B8A79] focus:outline-none disabled:bg-gray-100 disabled:opacity-50 ${
              unknownAbsentRolls.length > 0
                ? 'border-[#A7674D] ring-1 ring-[#A7674D]'
                : 'border-[#9B8A79]/40 focus:border-[#1E1E16]'
            }`}
          />

          {allUnknownRolls.length > 0 && (
            <div className="p-2.5 rounded-lg bg-[#F5DDD4] border border-[#1E1E16] text-[#1E1E16] text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#A7674D]" />
              <span>
                <strong>Validation Error:</strong> Unknown Roll Number(s):{' '}
                <span className="font-mono font-bold">{allUnknownRolls.join(', ')}</span>. Please check the uploaded class roll list.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[#1E1E16] mb-1 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6C6B50] text-[#F1F0EB]" />
                On Duty (OD) Roll Numbers
              </label>
              <input
                type="text"
                disabled={isHoliday}
                placeholder="e.g. 5, 12, 19"
                value={odInput}
                onChange={(e) => handleOdTextChange(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] placeholder:text-[#9B8A79] focus:outline-none focus:border-[#1E1E16]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#1E1E16] mb-1 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6C6B50]" />
                Sanctioned Leave (L) Roll Numbers
              </label>
              <input
                type="text"
                disabled={isHoliday}
                placeholder="e.g. 8, 25"
                value={leaveInput}
                onChange={(e) => handleLeaveTextChange(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] placeholder:text-[#9B8A79] focus:outline-none focus:border-[#1E1E16]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* STEP 03 – Review Live Student Status Grid */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#A7674D] text-[#F1F0EB] flex items-center justify-center text-xs font-bold">
              3
            </span>
            <h3 className="text-sm font-bold text-[#1E1E16] uppercase tracking-wide">
              Step 03 — Interactive Student Roster
            </h3>
          </div>
          <span className="text-[11px] text-[#9B8A79]">
            Click student card to cycle status: <strong>P → A → OD → L → P</strong>
          </span>
        </div>

        {isHoliday ? (
          <div className="p-8 text-center bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-xl text-[#1E1E16]">
            <CalendarOff className="w-8 h-8 mx-auto mb-2 opacity-80" />
            <h4 className="text-sm font-bold">This date is marked as an Official Holiday</h4>
            <p className="text-xs text-[#9B8A79] mt-1">
              Students will not be counted absent. All session calculations exclude declared holidays.
            </p>
          </div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#9B8A79]">
            No active students found in this class. Please import your student list first.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 max-h-96 overflow-y-auto pr-1">
            {students.map((s) => {
              const id = String(s.roll_no || s.reg_no);
              const status = studentStatuses[id] || 'P';

              const badgeColors: Record<StatusType, { bg: string; text: string; border: string; pill: string }> = {
                P: { bg: 'bg-[#E4E0D5]', text: 'text-[#1E1E16]', border: 'border-[#9B8A79]/40', pill: 'bg-[#1E1E16]' },
                A: { bg: 'bg-[#F5DDD4]', text: 'text-[#1E1E16]', border: 'border-[#1E1E16]', pill: 'bg-[#A7674D]' },
                OD: { bg: 'bg-[#E4E0D5]', text: 'text-[#1E1E16]', border: 'border-[#9B8A79]/40', pill: 'bg-[#6C6B50] text-[#F1F0EB]' },
                L: { bg: 'bg-[#E4E0D5]', text: 'text-[#6C6B50]', border: 'border-[#9B8A79]/40', pill: 'bg-[#6C6B50]' },
              };

              const style = badgeColors[status];

              return (
                <div
                  key={s.id}
                  onClick={() => cycleStudentStatus(id)}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between select-none ${style.bg} ${style.border} hover:shadow-xs`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-xs font-mono-numbers text-[#1E1E16] truncate">
                      Roll {s.roll_no || s.sNo}
                    </span>
                    <span
                      className={`w-6 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${style.pill}`}
                    >
                      {status}
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold truncate mt-1 text-[#1E1E16]">
                    {s.name}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-[#9B8A79] font-mono mt-0.5">
                    <span className="truncate">{s.reg_no}</span>
                    {s.sNo && <span className="shrink-0 ml-1">S.No {s.sNo}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* STEP 04 – Save / Update Attendance Action */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-[#1E1E16]">
            {exists ? 'Session Attendance Already Saved' : 'Ready to Save Attendance'}
          </span>
          <p className="text-[11px] text-[#9B8A79]">
            {exists
              ? `Session records for ${selectedDate} (Period P${selectedPeriod}) exist in SQLite. Click button to update.`
              : `Submit session attendance for ${weekdayName}, ${selectedDate} (Period P${selectedPeriod}).`}
          </p>
        </div>

        <button
          onClick={handleSaveAttendance}
          disabled={saving || loading}
          className="px-6 py-2.5 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          <span>{exists ? 'Update Attendance' : 'Save Attendance'}</span>
        </button>
      </div>
    </div>
  );
};
