import React, { useState, useEffect } from 'react';
import {
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  Layers,
  FileText,
  Table,
  Check,
  Info,
  Clock,
  BookOpen,
  GraduationCap,
  Building,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { DatasetInfo } from '../types';
import { apiFetch } from '../authClient';

interface ExportReportsViewProps {
  datasets: DatasetInfo[];
  activeDataset: string;
}

export const ExportReportsView: React.FC<ExportReportsViewProps> = ({ datasets, activeDataset }) => {
  const [selectedDataset, setSelectedDataset] = useState(activeDataset || 'Class 1');
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  // Academic Configuration
  const [department, setDepartment] = useState<string>('');
  const [academicYear, setAcademicYear] = useState<string>('2026-2027');
  const [yearOfStudy, setYearOfStudy] = useState<string>('4th Year (Final Year)');
  const [semester, setSemester] = useState<string>('Semester 7');
  const [facultyName, setFacultyName] = useState<string>('');

  // Option A - Monthly Filters
  const [monthlyMonth, setMonthlyMonth] = useState<number>(new Date().getMonth() + 1);
  const [monthlyYear, setMonthlyYear] = useState<number>(new Date().getFullYear());

  // Option B - Semester Date Range
  const [semesterStartDate, setSemesterStartDate] = useState<string>(
    `${new Date().getFullYear()}-07-01`
  );
  const [semesterEndDate, setSemesterEndDate] = useState<string>(
    `${new Date().getFullYear()}-11-30`
  );

  // Download state and feedback
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [savedSessionsCount, setSavedSessionsCount] = useState<number>(0);

  // Sync selectedDataset when activeDataset changes
  useEffect(() => {
    if (activeDataset) setSelectedDataset(activeDataset);
  }, [activeDataset]);

  // Fetch faculty profile, subject lists, and actual saved session date bounds
  useEffect(() => {
    apiFetch('/api/profile')
      .then(r => r.json())
      .then(d => {
        if (d.profile) {
          if (d.profile.department) setDepartment(d.profile.department);
          if (d.profile.academic_year) setAcademicYear(d.profile.academic_year);
          if (d.profile.year_of_study) setYearOfStudy(d.profile.year_of_study);
          if (d.profile.semester) setSemester(d.profile.semester);
          if (d.profile.faculty_name) setFacultyName(d.profile.faculty_name);
        }
      })
      .catch(() => {});

    apiFetch('/api/subjects')
      .then(r => r.json())
      .then(d => {
        if (d.subjects && d.subjects.length > 0) {
          setSubjects(d.subjects);
          setSelectedSubjectId(String(d.subjects[0].id));
        } else {
          setSubjects([]);
          setSelectedSubjectId('');
        }
      })
      .catch(() => {});

    apiFetch(`/api/export/bounds?dataset=${encodeURIComponent(selectedDataset)}`)
      .then(r => r.json())
      .then(d => {
        if (d) {
          if (d.minDate) setSemesterStartDate(d.minDate);
          if (d.maxDate) setSemesterEndDate(d.maxDate);
          if (d.latestMonth) setMonthlyMonth(d.latestMonth);
          if (d.latestYear) setMonthlyYear(d.latestYear);
          setSavedSessionsCount(d.totalSavedSessions || 0);
        }
      })
      .catch(() => {});
  }, [selectedDataset]);

  const months = [
    { num: 1, name: 'January' },
    { num: 2, name: 'February' },
    { num: 3, name: 'March' },
    { num: 4, name: 'April' },
    { num: 5, name: 'May' },
    { num: 6, name: 'June' },
    { num: 7, name: 'July' },
    { num: 8, name: 'August' },
    { num: 9, name: 'September' },
    { num: 10, name: 'October' },
    { num: 11, name: 'November' },
    { num: 12, name: 'December' },
  ];

  const currentDatasetInfo = datasets.find(d => d.name === selectedDataset);

  // Safe client-side download executor that guarantees valid binary blob or friendly error
  const executeDownload = async (url: string, filename: string, key: string) => {
    setDownloadingId(key);
    setDownloadError(null);
    try {
      const res = await apiFetch(url);
      if (!res.ok) {
        let errText = 'Export failed';
        try {
          const j = await res.json();
          errText = j.error || errText;
        } catch (_) {}
        throw new Error(errText);
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      setDownloadError(err.message || 'Download failed. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Option A URL builder
  const buildMonthlyUrl = () => {
    const params = new URLSearchParams({
      dataset: selectedDataset,
      mode: 'monthly',
      year: String(monthlyYear),
      month: String(monthlyMonth),
      department,
      academic_year: academicYear,
      year_of_study: yearOfStudy,
      semester,
      faculty_name: facultyName
    });
    if (selectedSubjectId) params.set('subject_id', selectedSubjectId);
    return `/api/export/register.xlsx?${params.toString()}`;
  };

  // Option B URL builder
  const buildSemesterUrl = () => {
    const params = new URLSearchParams({
      dataset: selectedDataset,
      mode: 'semester',
      startDate: semesterStartDate,
      endDate: semesterEndDate,
      department,
      academic_year: academicYear,
      year_of_study: yearOfStudy,
      semester,
      faculty_name: facultyName
    });
    if (selectedSubjectId) params.set('subject_id', selectedSubjectId);
    return `/api/export/register.xlsx?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E1E16]">
          Official Academic Attendance Registers & Reports
        </span>
        <h2 className="text-lg font-bold text-[#1E1E16] tracking-tight">
          Export Official Attendance Reports
        </h2>
        <p className="text-xs text-[#9B8A79] mt-0.5 max-w-2xl">
          Generate valid Microsoft Excel (.xlsx) workbooks directly from actual recorded class sessions. Each register is formatted with institutional 4-tier headers, distinct multi-period columns, working hours, and authentic attendance marks.
        </p>

        {downloadError && (
          <div className="mt-3 p-3 bg-[#F5DDD4] border border-[#1E1E16] rounded-lg text-xs text-[#1E1E16] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}
      </div>

      {/* Institutional Metadata Card (Pre-fills Rows 1 & 2 in the Excel Register) */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-2">
          <h3 className="text-xs font-bold text-[#1E1E16] uppercase tracking-wider flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#1E1E16]" />
            <span>Institutional Header Metadata (Appears on Rows 1 & 2 of Exported Workbooks)</span>
          </h3>
          {currentDatasetInfo && (
            <span className="text-[11px] text-[#9B8A79]">
              Active Class: <strong>{currentDatasetInfo.name}</strong> ({currentDatasetInfo.studentCount} Students)
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
              Department:
            </label>
            <input
              type="text"
              placeholder="e.g. Information Science and Engineering"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
              Academic Year:
            </label>
            <input
              type="text"
              placeholder="e.g. 2026-2027"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
              Year of Study:
            </label>
            <input
              type="text"
              placeholder="e.g. Final Year (4th Year)"
              value={yearOfStudy}
              onChange={(e) => setYearOfStudy(e.target.value)}
              className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
              Semester:
            </label>
            <input
              type="text"
              placeholder="e.g. Semester 7"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
            />
          </div>
        </div>
      </div>

      {/* Main Options Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OPTION A: MONTHLY ATTENDANCE REPORT */}
        <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-6 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#A7674D] text-[#F1F0EB] flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#F1F0EB] bg-[#6C6B50] px-2 py-0.5 rounded-md">
                  Option 1
                </span>
                <h3 className="text-sm font-bold text-[#1E1E16] mt-0.5">
                  Monthly Attendance Excel
                </h3>
                <p className="text-[11px] text-[#9B8A79]">
                  Exports attendance strictly for the selected month containing only actual saved class sessions.
                </p>
              </div>
            </div>

            {/* Selection Fields for Option A */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1 border-t border-[#9B8A79]/40">
              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Class / Section:
                </label>
                <select
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  className="w-full text-xs font-semibold px-2.5 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                >
                  {datasets.map(d => (
                    <option key={d.name} value={d.name}>
                      {d.name} ({d.studentCount} students)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Subject:
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full text-xs font-semibold px-2.5 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || 'SUB'})
                    </option>
                  ))}
                  {subjects.length === 0 && <option value="">Primary Subject</option>}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Month:
                </label>
                <select
                  value={monthlyMonth}
                  onChange={(e) => setMonthlyMonth(parseInt(e.target.value, 10))}
                  className="w-full text-xs font-semibold px-2.5 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                >
                  {months.map(m => (
                    <option key={m.num} value={m.num}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Year:
                </label>
                <select
                  value={monthlyYear}
                  onChange={(e) => setMonthlyYear(parseInt(e.target.value, 10))}
                  className="w-full text-xs font-semibold px-2.5 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3 bg-white border border-[#9B8A79]/40 rounded-lg text-[11px] space-y-1 text-[#9B8A79]">
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#1E1E16]" />
                <span>Includes only actual recorded sessions conducted in <strong>{months.find(m => m.num === monthlyMonth)?.name} {monthlyYear}</strong>.</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#1E1E16]" />
                <span>Multi-period entries on the same date appear as separate columns (P1, P5).</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={downloadingId === 'monthly'}
            onClick={() => executeDownload(
              buildMonthlyUrl(),
              `Monthly_Attendance_${selectedDataset}_${monthlyMonth}_${monthlyYear}.xlsx`,
              'monthly'
            )}
            className="w-full mt-4 py-2.5 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            {downloadingId === 'monthly' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating Valid XLSX...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download Monthly Attendance Excel</span>
              </>
            )}
          </button>
        </div>

        {/* OPTION B: FULL SEMESTER ATTENDANCE REPORT */}
        <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-6 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#A7674D] text-[#F1F0EB] flex items-center justify-center shrink-0">
                <Table className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1E1E16] bg-[#E4E0D5] px-2 py-0.5 rounded-md">
                  Option 2
                </span>
                <h3 className="text-sm font-bold text-[#1E1E16] mt-0.5">
                  Complete Semester Attendance Excel
                </h3>
                <p className="text-[11px] text-[#9B8A79]">
                  Exports complete semester attendance across saved database sessions ({savedSessionsCount} saved working session{savedSessionsCount === 1 ? '' : 's'}) with month-grouped column headers.
                </p>
              </div>
            </div>

            {/* Selection Fields for Option B */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1 border-t border-[#9B8A79]/40">
              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Class / Section:
                </label>
                <select
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  className="w-full text-xs font-semibold px-2.5 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                >
                  {datasets.map(d => (
                    <option key={d.name} value={d.name}>
                      {d.name} ({d.studentCount} students)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Subject:
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full text-xs font-semibold px-2.5 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || 'SUB'})
                    </option>
                  ))}
                  {subjects.length === 0 && <option value="">Primary Subject</option>}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Semester Start Date:
                </label>
                <input
                  type="date"
                  value={semesterStartDate}
                  onChange={(e) => setSemesterStartDate(e.target.value)}
                  className="w-full text-xs font-semibold px-2.5 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1E1E16] mb-1">
                  Semester End Date:
                </label>
                <input
                  type="date"
                  value={semesterEndDate}
                  onChange={(e) => setSemesterEndDate(e.target.value)}
                  className="w-full text-xs font-semibold px-2.5 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>
            </div>

            <div className="p-3 bg-white border border-[#9B8A79]/40 rounded-lg text-[11px] space-y-1 text-[#9B8A79]">
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#1E1E16]" />
                <span>Exports all actual recorded sessions conducted between <strong>{semesterStartDate}</strong> and <strong>{semesterEndDate}</strong>.</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#1E1E16]" />
                <span>Sessions are organized with month-grouped column headers in Row 5.</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={downloadingId === 'semester'}
            onClick={() => executeDownload(
              buildSemesterUrl(),
              `Complete_Semester_Attendance_${selectedDataset}_${semesterStartDate}_to_${semesterEndDate}.xlsx`,
              'semester'
            )}
            className="w-full mt-4 py-2.5 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            {downloadingId === 'semester' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating Valid XLSX...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download Complete Semester Attendance Excel</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Additional Export Formats (5-Sheet Workbook & Plain CSV) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 5-Sheet Summary Workbook */}
        <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#6C6B50] text-[#F1F0EB]/20 text-[#1E1E16] flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#1E1E16]">
                5-Sheet Summary Institutional Workbook (.xlsx)
              </h4>
              <p className="text-[11px] text-[#9B8A79] mt-0.5">
                Contains Student Summary, Day-Wise Matrix, Detailed Attendance Logs, Holidays, and Subject & Period Summary.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={downloadingId === '5sheet'}
            onClick={() => executeDownload(
              `/api/export/excel?dataset=${encodeURIComponent(selectedDataset)}&year=${monthlyYear}&month=${monthlyMonth}`,
              `FacultyLog_5Sheet_${selectedDataset}_${monthlyYear}_${monthlyMonth}.xlsx`,
              '5sheet'
            )}
            className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-[#1E1E16] bg-white border border-[#9B8A79]/40 hover:bg-[#F1F0EB]/20 disabled:opacity-50 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            {downloadingId === '5sheet' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1E1E16]" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[#1E1E16]" />
            )}
            <span>Download 5-Sheet Summary Workbook (.xlsx)</span>
          </button>
        </div>

        {/* Option 4: Plain CSV Period-Wise Export */}
        <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#6C6B50] text-[#F1F0EB]/20 text-[#1E1E16] flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#1E1E16]">
                Period-Wise Plain CSV Export (.csv)
              </h4>
              <p className="text-[11px] text-[#9B8A79] mt-0.5">
                Comma-separated period-wise attendance matrix with register numbers, present/absent counts, and percentages.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={downloadingId === 'csv'}
            onClick={() => executeDownload(
              `/api/export/register.csv?dataset=${encodeURIComponent(selectedDataset)}&year=${monthlyYear}&month=${monthlyMonth}`,
              `FacultyLog_${selectedDataset}_Attendance.csv`,
              'csv'
            )}
            className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-[#1E1E16] bg-white border border-[#9B8A79]/40 hover:bg-[#F1F0EB]/20 disabled:opacity-50 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            {downloadingId === 'csv' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1E1E16]" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[#1E1E16]" />
            )}
            <span>Download Period-Wise CSV (.csv)</span>
          </button>
        </div>
      </div>

      {/* Official Register Format Structure Reference */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[#1E1E16]" />
            <h4 className="text-xs font-bold text-[#1E1E16] uppercase tracking-wider">
              Official Register Layout & Excel Cell Colours
            </h4>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="px-2 py-0.5 rounded border border-green-700/30 bg-[#E8F5E9] text-[#008000]">P — Present (Green)</span>
            <span className="px-2 py-0.5 rounded border border-red-700/30 bg-[#FFEBEE] text-[#FF0000]">A — Absent (Red)</span>
            <span className="px-2 py-0.5 rounded border border-green-700/30 bg-[#E8F5E9] text-[#008000]">OD — On Duty (Green)</span>
            <span className="px-2 py-0.5 rounded border border-amber-700/30 bg-[#FFF8E1] text-[#8D6E00]">Holiday — Light Amber</span>
          </div>
        </div>

        <div className="overflow-x-auto bg-white border border-[#9B8A79]/40 rounded-lg p-3 text-[11px] font-mono">
          <div className="text-[#9B8A79] space-y-1 pb-3 border-b border-[#9B8A79]/40">
            <p><strong>Row 1:</strong> CLASS: {department || selectedDataset} &nbsp;|&nbsp; SUBJECT: {subjects.find(s => String(s.id) === selectedSubjectId)?.name || 'Course Subject'} &nbsp;|&nbsp; FACULTY: {facultyName || 'Course Faculty'} &nbsp;|&nbsp; ACADEMIC YEAR: {academicYear} ({yearOfStudy}) &nbsp;|&nbsp; SEMESTER: {semester}</p>
            <p><strong>Row 2:</strong> TOTAL HOURS &nbsp;|&nbsp; WEEKLY TARGET &nbsp;|&nbsp; TYPE &nbsp;|&nbsp; TOTAL SESSIONS: Actual Saved Database Records Only ({savedSessionsCount} saved)</p>
          </div>

          <div className="pt-2 text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#FFFFFF] text-[#1E1E16] font-bold">
                  <th className="p-1 border border-[#9B8A79]/40">SN</th>
                  <th className="p-1 border border-[#9B8A79]/40">REGNO</th>
                  <th className="p-1 border border-[#9B8A79]/40">NAME</th>
                  <th className="p-1 border border-[#9B8A79]/40 text-center">P3 (20/07 M)</th>
                  <th className="p-1 border border-[#9B8A79]/40 text-center">P3 (22/07 W)</th>
                  <th className="p-1 border border-[#9B8A79]/40 text-center">P4 (23/07 TH)</th>
                  <th className="p-1 border border-[#9B8A79]/40 text-center">P3 (26/08 W)</th>
                  <th className="p-1 border border-[#9B8A79]/40 text-center">HRS. ATT.</th>
                  <th className="p-1 border border-[#9B8A79]/40 text-center">% ATT.</th>
                  <th className="p-1 border border-[#9B8A79]/40 text-center">MARKS (MAX 5)</th>
                </tr>
              </thead>
              <tbody className="text-[#9B8A79] text-[11px]">
                <tr>
                  <td className="p-1 border border-[#9B8A79]/40 font-mono-numbers">1</td>
                  <td className="p-1 border border-[#9B8A79]/40 font-mono-numbers">&lt;Uploaded RegNo&gt;</td>
                  <td className="p-1 border border-[#9B8A79]/40">&lt;Uploaded Student Name&gt;</td>
                  <td className="p-1 border border-[#9B8A79]/40 text-center bg-[#E8F5E9] text-[#008000] font-bold">P</td>
                  <td className="p-1 border border-[#9B8A79]/40 text-center bg-[#E8F5E9] text-[#008000] font-bold">OD</td>
                  <td className="p-1 border border-[#9B8A79]/40 text-center bg-[#FFEBEE] text-[#FF0000] font-bold">A</td>
                  <td className="p-1 border border-[#9B8A79]/40 text-center bg-[#FFF8E1] text-[#8D6E00] font-bold">Holiday</td>
                  <td className="p-1 border border-[#9B8A79]/40 text-center font-bold">—</td>
                  <td className="p-1 border border-[#9B8A79]/40 text-center font-bold">—</td>
                  <td className="p-1 border border-[#9B8A79]/40 text-center font-bold text-[#1E1E16]">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Updated Project Source ZIP Download */}
        <div className="pt-2 border-t border-[#9B8A79]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-[#1E1E16]">Updated FacultyLog Project Archive (.zip)</span>
            <p className="text-[11px] text-[#9B8A79]">
              Download the complete updated FacultyLog source code and SQLite class databases as a single ZIP package.
            </p>
          </div>
          <button
            type="button"
            disabled={downloadingId === 'projectzip'}
            onClick={() => executeDownload(
              '/api/export/project-source.zip',
              'FacultyLog_updated.zip',
              'projectzip'
            )}
            className="px-4 py-2 rounded-lg text-xs font-bold text-[#1E1E16] bg-[#E4E0D5] border border-[#9B8A79]/40 hover:bg-[#6C6B50] hover:text-[#F1F0EB] disabled:opacity-50 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
          >
            {downloadingId === 'projectzip' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Download Updated Project ZIP</span>
          </button>
        </div>
      </div>
    </div>
  );
};
