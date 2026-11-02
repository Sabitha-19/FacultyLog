import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Award,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Printer,
  ChevronDown
} from 'lucide-react';
import { Student, StudentDetailReport } from '../types';
import { apiFetch } from '../authClient';

interface StudentReportViewProps {
  students: Student[];
  activeDataset: string;
}

export const StudentReportView: React.FC<StudentReportViewProps> = ({ students, activeDataset }) => {
  const [selectedStudentId, setSelectedStudentId] = useState<number>(students[0]?.id || 1);
  const [report, setReport] = useState<StudentDetailReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (students.length > 0 && !students.some(s => s.id === selectedStudentId)) {
      setSelectedStudentId(students[0].id);
    }
  }, [students]);

  const fetchStudentReport = async () => {
    if (!selectedStudentId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/reports/student/${selectedStudentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch student report');
      setReport(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentReport();
  }, [selectedStudentId, activeDataset]);

  const handlePrint = () => {
    window.print();
  };

  if (students.length === 0) {
    return (
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-12 text-center shadow-xs">
        <UserCheck className="w-8 h-8 text-[#9B8A79] mx-auto mb-2" />
        <h3 className="text-base font-bold text-[#1E1E16]">No student records found in {activeDataset}</h3>
        <p className="text-xs text-[#9B8A79] mt-1">
          Please upload your genuine student Excel or CSV list from Student Management or Step 1 Workflow to view individual student reports.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Student Selector Card */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-[#1E1E16] shrink-0">
            Select Student:
          </label>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(parseInt(e.target.value, 10))}
            className="text-xs font-semibold px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16] min-w-[280px]"
          >
            {students.map(s => (
              <option key={s.id} value={s.id}>
                Roll {s.roll_no} • {s.name} ({s.reg_no})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-[#1E1E16] bg-white border border-[#9B8A79]/40 hover:bg-[#F1F0EB]/20 transition-all cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-[#1E1E16]" />
          <span>Print Individual Report</span>
        </button>
      </div>

      {report && (
        <>
          {/* Main Student Report Card */}
          <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#9B8A79]/40 pb-4 mb-5 gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E1E16]">
                  Academic Attendance Transcript
                </span>
                <h2 className="text-2xl font-extrabold text-[#1E1E16] tracking-tight mt-0.5">
                  {report.student.name}
                </h2>
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#9B8A79] mt-1">
                  <span>Roll No: <strong>{report.student.roll_no}</strong></span>
                  <span>•</span>
                  <span>Reg No: <strong>{report.student.reg_no}</strong></span>
                  <span>•</span>
                  <span>Class: <strong>{activeDataset}</strong></span>
                </div>
              </div>

              {/* Attendance Marks Award Banner */}
              <div className="p-3 bg-white border border-[#9B8A79]/40 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#A7674D] text-[#F1F0EB] flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#9B8A79]">Attendance Marks</span>
                  <div className="text-lg font-extrabold text-[#1E1E16] font-mono-numbers">
                    {report.stats.marks} <span className="text-xs font-normal text-[#9B8A79]">/ 5 Marks</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono-numbers mb-6">
              <div className="p-3 bg-white border border-[#9B8A79]/40 rounded-lg">
                <span className="text-[10px] text-[#9B8A79] font-sans uppercase font-semibold">Working Sessions</span>
                <p className="text-xl font-bold text-[#1E1E16] mt-1">{report.stats.workingDays}</p>
              </div>

              <div className="p-3 bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-lg">
                <span className="text-[10px] text-[#1E1E16] font-sans uppercase font-semibold">Attended</span>
                <p className="text-xl font-bold text-[#1E1E16] mt-1">{report.stats.present}</p>
              </div>

              <div className="p-3 bg-[#F5DDD4] border border-[#1E1E16] rounded-lg">
                <span className="text-[10px] text-[#1E1E16] font-sans uppercase font-semibold">Absences</span>
                <p className="text-xl font-bold text-[#1E1E16] mt-1">{report.stats.absent}</p>
              </div>

              <div className="p-3 bg-white border border-[#9B8A79]/40 rounded-lg">
                <span className="text-[10px] text-[#9B8A79] font-sans uppercase font-semibold">Holidays</span>
                <p className="text-xl font-bold text-[#1E1E16] mt-1">{report.stats.holidays}</p>
              </div>

              <div className="p-3 bg-white border border-[#9B8A79]/40 rounded-lg">
                <span className="text-[10px] text-[#9B8A79] font-sans uppercase font-semibold">Attendance %</span>
                <p className={`text-xl font-bold mt-1 ${
                  report.stats.attendancePct >= 75 ? 'text-[#1E1E16]' : 'text-[#1E1E16]'
                }`}>
                  {report.stats.attendancePct}%
                </p>
              </div>
            </div>

            {/* Monthly Breakdown Grid */}
            <div className="space-y-3 mb-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1E1E16]">
                Month-by-Month Attendance Breakdown
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {report.monthlyStats.map((m) => {
                  const pct = m.total_sessions > 0 ? ((m.present / m.total_sessions) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={m.month} className="p-3 bg-white border border-[#9B8A79]/40 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-[#1E1E16] font-mono-numbers">{m.month}</span>
                        <span className="font-bold text-[#1E1E16] font-mono-numbers">{pct}%</span>
                      </div>
                      <div className="text-[11px] text-[#9B8A79] flex items-center justify-between">
                        <span className="text-[#1E1E16] font-semibold">{m.present} Present</span>
                        <span className="text-[#1E1E16] font-semibold">{m.absent} Absent</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detailed Day-by-Day Session Logs */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1E1E16] mb-2">
                Recent Session History Log
              </h4>
              <div className="max-h-64 overflow-y-auto border border-[#9B8A79]/40 rounded-lg bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F1F0EB]/40 border-b border-[#9B8A79]/40 text-[#1E1E16] text-[11px] font-bold">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Period</th>
                      <th className="py-2 px-3">Subject</th>
                      <th className="py-2 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#9B8A79]/15 font-mono-numbers">
                    {report.logs.map((log, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-[#1E1E16]">{log.attendance_date}</td>
                        <td className="py-2 px-3 text-[#9B8A79]">P{log.period_no || 1}</td>
                        <td className="py-2 px-3 text-[#1E1E16] font-sans">{log.subject_name || 'Classroom'}</td>
                        <td className="py-2 px-3 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.status === 'P' || log.status === 'OD'
                              ? 'bg-[#E4E0D5] text-[#1E1E16]'
                              : 'bg-[#F5DDD4] text-[#1E1E16]'
                          }`}>
                            {log.status === 'OD' ? 'ON DUTY (OD)' : log.status === 'P' ? 'PRESENT' : 'ABSENT'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
