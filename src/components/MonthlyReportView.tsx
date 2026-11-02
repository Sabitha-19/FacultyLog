import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Search,
  Filter,
  AlertTriangle,
  CalendarCheck,
  CheckCircle2
} from 'lucide-react';
import { MonthlyReportData } from '../types';
import { apiFetch, downloadAuthenticatedFile } from '../authClient';

interface MonthlyReportViewProps {
  activeDataset: string;
}

export const MonthlyReportView: React.FC<MonthlyReportViewProps> = ({ activeDataset }) => {
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(10);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [report, setReport] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterLowOnly, setFilterLowOnly] = useState<boolean>(false);

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

  useEffect(() => {
    apiFetch(`/api/export/bounds?dataset=${encodeURIComponent(activeDataset)}`)
      .then(r => r.json())
      .then(d => {
        if (d && d.hasRecords && d.latestYear && d.latestMonth) {
          setYear(d.latestYear);
          setMonth(d.latestMonth);
        }
      })
      .catch(() => {});
  }, [activeDataset]);

  const fetchMonthlyReport = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/reports/monthly?year=${year}&month=${month}&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch monthly report');
      setReport(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlyReport();
  }, [year, month, searchQuery, activeDataset]);

  const students = (report?.summary || []).filter(s => {
    if (filterLowOnly) return s.isLow;
    return true;
  });

  const lowAttendanceCount = (report?.summary || []).filter(s => s.isLow).length;

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls Bar */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 text-xs text-[#1E1E16]">
            <span className="font-semibold">Month:</span>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className="px-3 py-1.5 bg-white border border-[#9B8A79]/40 rounded-lg text-xs font-semibold text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
            >
              {months.map(m => (
                <option key={m.num} value={m.num}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Year Selector */}
          <div className="flex items-center gap-1.5 text-xs text-[#1E1E16]">
            <span className="font-semibold">Year:</span>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="px-3 py-1.5 bg-white border border-[#9B8A79]/40 rounded-lg text-xs font-semibold text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#9B8A79] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search students in matrix..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] placeholder:text-[#9B8A79] focus:outline-none focus:border-[#1E1E16] w-48 sm:w-60"
            />
          </div>

          {/* Low Attendance Filter Toggle */}
          <button
            onClick={() => setFilterLowOnly(!filterLowOnly)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
              filterLowOnly
                ? 'bg-[#A7674D] text-white border-[#A7674D]'
                : 'bg-white text-[#1E1E16] border-[#9B8A79]/40 hover:bg-[#F1F0EB]/20'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Low Attendance (&lt;{report?.threshold || 75}%)</span>
            {lowAttendanceCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${filterLowOnly ? 'bg-white text-[#1E1E16]' : 'bg-[#F5DDD4] text-[#1E1E16]'}`}>
                {lowAttendanceCount}
              </span>
            )}
          </button>
        </div>

        {/* Excel Export Button */}
        <button
          type="button"
          onClick={() =>
            downloadAuthenticatedFile(
              `/api/export/register.xlsx?dataset=${encodeURIComponent(activeDataset)}&mode=monthly&year=${year}&month=${month}`,
              `Monthly_Attendance_${activeDataset}_${month}_${year}.xlsx`
            )
          }
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-xs cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Monthly Attendance Excel</span>
        </button>
      </div>

      {/* Summary Metrics Bar */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl">
            <span className="text-[10px] text-[#9B8A79] uppercase font-semibold">Total Students</span>
            <p className="text-xl font-bold text-[#1E1E16] font-mono-numbers mt-0.5">{report.summary.length}</p>
          </div>
          <div className="p-3 bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl">
            <span className="text-[10px] text-[#9B8A79] uppercase font-semibold">Submitted Working Days</span>
            <p className="text-xl font-bold text-[#1E1E16] font-mono-numbers mt-0.5">{report.workingDaysCount}</p>
          </div>
          <div className="p-3 bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl">
            <span className="text-[10px] text-[#9B8A79] uppercase font-semibold">Declared Holidays</span>
            <p className="text-xl font-bold text-[#1E1E16] font-mono-numbers mt-0.5">{report.holidays.length}</p>
          </div>
          <div className="p-3 bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl">
            <span className="text-[10px] text-[#9B8A79] uppercase font-semibold">Students with Low %</span>
            <p className="text-xl font-bold text-[#1E1E16] font-mono-numbers mt-0.5">{lowAttendanceCount}</p>
          </div>
        </div>
      )}

      {/* Day-Wise Attendance Matrix */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-center border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-[#F1F0EB] border-b border-[#9B8A79]/40 text-[#1E1E16] text-[11px] font-bold">
              <tr>
                <th className="py-2.5 px-2 text-center w-10 sticky left-0 z-30 bg-[#F1F0EB] border-r border-[#9B8A79]/40">
                  #
                </th>
                <th className="py-2.5 px-3 text-left w-24 sticky left-10 z-30 bg-[#F1F0EB] border-r border-[#9B8A79]/40">
                  Roll No
                </th>
                <th className="py-2.5 px-3 text-left w-44 sticky left-34 z-30 bg-[#F1F0EB] border-r border-[#9B8A79]/40 shadow-xs">
                  Student Name
                </th>
                {report?.monthDays.map((day) => {
                  const dayNum = day.slice(8); // '01', '02'...
                  const isSubmitted = report.submittedDates.includes(day);
                  return (
                    <th
                      key={day}
                      className={`py-2 px-1 border-r border-[#9B8A79]/40 min-w-[30px] font-mono-numbers ${
                        isSubmitted ? 'bg-[#F1F0EB]/30 text-[#1E1E16]' : 'text-[#9B8A79]'
                      }`}
                      title={day}
                    >
                      <span>{dayNum}</span>
                    </th>
                  );
                })}
                <th className="py-2.5 px-3 border-l border-[#9B8A79]/40 text-center w-16">
                  Present
                </th>
                <th className="py-2.5 px-3 text-center w-16">
                  Absent
                </th>
                <th className="py-2.5 px-3 text-center w-20">
                  Att %
                </th>
                <th className="py-2.5 px-3 text-center w-16">
                  Marks
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#9B8A79]/20 font-mono-numbers">
              {students.length > 0 ? (
                students.map((s) => (
                  <tr key={s.id} className="hover:bg-white/60 transition-colors">
                    {/* Fixed Columns */}
                    <td className="py-2 px-2 text-center text-[#9B8A79] sticky left-0 z-10 bg-[#FFFFFF] border-r border-[#9B8A79]/40">
                      {s.sNo}
                    </td>
                    <td className="py-2 px-3 text-left font-bold text-[#1E1E16] sticky left-10 z-10 bg-[#FFFFFF] border-r border-[#9B8A79]/40">
                      {s.rollNo}
                    </td>
                    <td className="py-2 px-3 text-left font-semibold text-[#1E1E16] truncate max-w-[170px] sticky left-34 z-10 bg-[#FFFFFF] border-r border-[#9B8A79]/40 font-sans shadow-xs" title={s.name}>
                      {s.name}
                    </td>

                    {/* Day Cells */}
                    {report?.monthDays.map((day) => {
                      const status = s.dayStatuses[day] || '-';
                      let colorClass = 'text-[#9B8A79]';
                      if (status === 'P') colorClass = 'bg-[#E4E0D5] text-[#1E1E16] font-bold';
                      else if (status === 'OD') colorClass = 'bg-[#6C6B50]/20 text-[#1E1E16] font-bold';
                      else if (status === 'A') colorClass = 'bg-[#F5DDD4] text-[#1E1E16] font-bold';
                      else if (status === 'H') colorClass = 'bg-[#E4E0D5] text-[#1E1E16] font-bold';

                      return (
                        <td
                          key={day}
                          className={`py-1.5 px-0.5 border-r border-[#9B8A79]/40 text-[11px] ${colorClass}`}
                        >
                          {status}
                        </td>
                      );
                    })}

                    {/* Summary Columns */}
                    <td className="py-2 px-2 font-bold text-[#1E1E16] border-l border-[#9B8A79]/40">
                      {s.present}
                    </td>
                    <td className="py-2 px-2 font-bold text-[#1E1E16]">
                      {s.absent}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                        s.isLow
                          ? 'bg-[#F5DDD4] text-[#1E1E16] border border-[#1E1E16]'
                          : 'bg-[#E4E0D5] text-[#1E1E16]'
                      }`}>
                        {s.attendancePct}%
                      </span>
                    </td>
                    <td className="py-2 px-2 font-bold text-[#1E1E16]">
                      {s.marks} / 5
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={36} className="py-12 text-center text-[#9B8A79] font-sans">
                    {loading ? 'Loading report matrix...' : 'No student records match the active criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Legend Footer */}
        <div className="p-3 bg-[#F1F0EB]/40 border-t border-[#9B8A79]/40 flex flex-wrap items-center justify-between text-[11px] text-[#1E1E16]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-[#E4E0D5] text-[#1E1E16] font-bold text-[10px] flex items-center justify-center">P</span>
              Present
            </span>
            <span className="flex items-center gap-1.5">
              <span className="px-1 h-4 rounded bg-[#6C6B50]/20 text-[#1E1E16] font-bold text-[10px] flex items-center justify-center">OD</span>
              On Duty
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-[#F5DDD4] text-[#1E1E16] font-bold text-[10px] flex items-center justify-center">A</span>
              Absent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-[#E4E0D5] text-[#1E1E16] font-bold text-[10px] flex items-center justify-center">H</span>
              Holiday
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-gray-100 text-[#9B8A79] font-bold text-[10px] flex items-center justify-center">-</span>
              No Session Marked
            </span>
          </div>

          <span className="text-[#9B8A79]">
            Attendance Marks: Classroom (-1 for every 3 absent classes) • Lab (-1 for every 1 day absent)
          </span>
        </div>
      </div>
    </div>
  );
};
