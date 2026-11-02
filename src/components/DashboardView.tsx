import React, { useState } from 'react';
import {
  Users,
  Layers,
  CalendarCheck,
  Percent,
  CheckCircle,
  Clock,
  ArrowRight,
  CalendarOff,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  ListOrdered,
  Sparkles,
  Compass,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';
import { DashboardStats, DatasetInfo } from '../types';
import { PageId } from './Sidebar';
import { SemesterInsightSidebar } from './SemesterInsightSidebar';

interface DashboardViewProps {
  stats: DashboardStats | null;
  datasets: DatasetInfo[];
  onNavigate: (page: PageId) => void;
  onSelectDataset: (name: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  datasets,
  onNavigate,
  onSelectDataset,
}) => {
  const [showInsights, setShowInsights] = useState(true);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-[#9B8A79] font-medium font-body">
        Loading institutional dashboard metrics...
      </div>
    );
  }

  const {
    totalStudents,
    totalDatasets,
    totalWorkingDays,
    overallAttendancePct,
    todayAttendance,
    recentDates,
    monthlyTrend,
    holidays,
    threshold,
    faculty,
    department,
    academicYear,
    yearOfStudy,
    semester,
    classSection,
    hasProfile
  } = stats;

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start font-body">
      {/* Main Dashboard Column */}
      <div className="flex-1 space-y-6 w-full">
        {/* 0. Primary Action: Step-by-Step Attendance Workflow Banner */}
        <div className="bg-[#1E1E16] text-[#F1F0EB] rounded-2xl p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-5 border border-[#9B8A79]/30">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#A7674D] text-[#F1F0EB] flex items-center justify-center shrink-0 shadow-sm font-bold">
              <ListOrdered className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium tracking-wider uppercase px-2.5 py-0.5 rounded-md bg-[#6C6B50] text-[#F1F0EB]">
                  Academic Workflow
                </span>
                <span className="text-xs text-[#9B8A79] font-normal">Step 1 to 3 Attendance Setup</span>
              </div>
              <h2 className="text-lg font-heading font-medium text-[#F1F0EB] tracking-tight mt-1">
                Step-by-Step Attendance Workflow
              </h2>
              <p className="text-xs text-[#E4E0D5]/80 max-w-xl mt-0.5 font-normal">
                1. Student Info & Course Details → 2. Dates & Class Schedule → 3. Full Attendance Sheet with Roll No. & Attendance Status.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onNavigate('attendance-workflow')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-medium text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shrink-0 cursor-pointer shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Launch Workflow</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
            </button>
            <button
              onClick={() => setShowInsights(!showInsights)}
              className="xl:hidden flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-[#F1F0EB] bg-[#6C6B50] hover:bg-[#A7674D] transition-colors cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Insights</span>
            </button>
          </div>
        </div>

        {/* 0. Profile Setup Notice if not configured */}
        {!hasProfile && (
          <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[#1E1E16]">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#A7674D] text-[#F1F0EB] flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-heading font-medium text-[#1E1E16]">
                  Configure Faculty Profile & Subject Hours
                </h3>
                <p className="text-xs text-[#9B8A79] mt-0.5">
                  Set up your Faculty Name, Department, Academic Year, and Subject Hours to automatically populate your official registers.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('faculty-profile')}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shrink-0 cursor-pointer shadow-xs"
            >
              Complete Setup
            </button>
          </div>
        )}

        {/* 0. Empty State Notice if zero students */}
        {totalStudents === 0 && (
          <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[#1E1E16]">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#6C6B50] text-[#F1F0EB] flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-heading font-medium text-[#1E1E16]">
                  No student records found in this class
                </h3>
                <p className="text-xs text-[#9B8A79] mt-0.5">
                  Download the official 3-column template (S.No, Register Number, Student Name) and import your student list in Step 1.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('attendance-workflow')}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shrink-0 cursor-pointer shadow-xs"
            >
              Open Step 1
            </button>
          </div>
        )}

        {/* 1. Welcome Section */}
        <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9B8A79]">Academic Register</span>
              {department && (
                <span className="text-[10px] px-2.5 py-0.5 bg-[#6C6B50] text-[#F1F0EB] font-medium rounded-md">
                  {department} • {academicYear || '2026-2027'}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-heading font-medium text-[#1E1E16] tracking-tight mt-1.5">
              {faculty ? `Welcome, ${faculty}` : 'Welcome, Faculty Member'}
            </h1>
            <p className="text-xs text-[#9B8A79] mt-1 max-w-xl font-normal">
              {classSection ? `${classSection} (${yearOfStudy || 'Undergraduate'} • ${semester || 'Current Semester'})` : 'Institutional Attendance & Academic Management'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onNavigate('attendance-workflow')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-xs cursor-pointer"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Full Schedule Sheet</span>
            </button>
            <button
              onClick={() => onNavigate('daily-attendance')}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-[#1E1E16] bg-[#F1F0EB] border border-[#9B8A79]/40 hover:bg-[#6C6B50] hover:text-[#F1F0EB] transition-all cursor-pointer"
            >
              <CheckCircle className="w-3.5 h-3.5 text-[#A7674D]" />
              <span>Daily Register</span>
            </button>
            <button
              onClick={() => onNavigate('monthly-report')}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-[#1E1E16] bg-[#F1F0EB] border border-[#9B8A79]/40 hover:bg-[#6C6B50] hover:text-[#F1F0EB] transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#6C6B50]" />
              <span>Monthly Matrix</span>
            </button>
            <button
              onClick={() => setShowInsights(!showInsights)}
              title={showInsights ? "Hide Semester Insights" : "Show Semester Insights"}
              className="hidden xl:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-[#F1F0EB] bg-[#1E1E16] hover:bg-[#A7674D] transition-colors cursor-pointer"
            >
              {showInsights ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
              <span>{showInsights ? 'Hide Insights' : 'Show Insights'}</span>
            </button>
          </div>
        </div>

        {/* 2. Statistics Cards Grid (Earthy Pottery Theme) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Total Students */}
          <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-4.5 shadow-xs">
            <div className="flex items-center justify-between text-[#9B8A79] mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Students</span>
              <div className="w-7 h-7 rounded-lg bg-[#A7674D] flex items-center justify-center text-[#F1F0EB]">
                <Users className="w-3.5 h-3.5 stroke-[2]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1E1E16] font-mono-numbers">
              {totalStudents}
            </div>
            <p className="text-[11px] text-[#9B8A79] mt-1 font-normal">Active enrollments in class</p>
          </div>

          {/* Total Classes / Datasets */}
          <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-4.5 shadow-xs">
            <div className="flex items-center justify-between text-[#9B8A79] mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Classes / Batches</span>
              <div className="w-7 h-7 rounded-lg bg-[#6C6B50] flex items-center justify-center text-[#F1F0EB]">
                <Layers className="w-3.5 h-3.5 stroke-[2]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1E1E16] font-mono-numbers">
              {totalDatasets}
            </div>
            <p className="text-[11px] text-[#9B8A79] mt-1 font-normal">Configured datasets</p>
          </div>

          {/* Total Working Days */}
          <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-4.5 shadow-xs">
            <div className="flex items-center justify-between text-[#9B8A79] mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Working Days</span>
              <div className="w-7 h-7 rounded-lg bg-[#A7674D] flex items-center justify-center text-[#F1F0EB]">
                <CalendarCheck className="w-3.5 h-3.5 stroke-[2]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1E1E16] font-mono-numbers">
              {totalWorkingDays}
            </div>
            <p className="text-[11px] text-[#9B8A79] mt-1 font-normal">Distinct dates recorded</p>
          </div>

          {/* Today's Attendance */}
          <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-4.5 shadow-xs">
            <div className="flex items-center justify-between text-[#9B8A79] mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Today's Attendance</span>
              <div className="w-7 h-7 rounded-lg bg-[#6C6B50] flex items-center justify-center text-[#F1F0EB]">
                <CheckCircle className="w-3.5 h-3.5 stroke-[2]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1E1E16] font-mono-numbers">
              {todayAttendance.isMarked ? `${todayAttendance.present}/${todayAttendance.total}` : 'Unmarked'}
            </div>
            <p className="text-[11px] text-[#9B8A79] mt-1 font-normal">
              {todayAttendance.isMarked
                ? `${todayAttendance.absent} student(s) absent`
                : 'Click to record for today'}
            </p>
          </div>

          {/* Overall Attendance % */}
          <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-4.5 shadow-xs">
            <div className="flex items-center justify-between text-[#9B8A79] mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Overall Rate</span>
              <div className="w-7 h-7 rounded-lg bg-[#A7674D] flex items-center justify-center text-[#F1F0EB]">
                <Percent className="w-3.5 h-3.5 stroke-[2]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1E1E16] font-mono-numbers">
              {overallAttendancePct}%
            </div>
            <p className="text-[11px] text-[#9B8A79] mt-1 font-normal">Threshold target: {threshold}%</p>
          </div>
        </div>

        {/* 3. Middle Section: Monthly Trend Chart & Class Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Attendance Trend */}
          <div className="lg:col-span-2 bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-heading font-medium text-[#1E1E16] tracking-tight">
                  Monthly Attendance Trend
                </h3>
                <p className="text-[11px] text-[#9B8A79] font-normal">
                  Average attendance percentage across recorded months in this dataset
                </p>
              </div>
              <button
                onClick={() => onNavigate('monthly-report')}
                className="text-xs text-[#A7674D] hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                <span>View Matrix</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {monthlyTrend.length > 0 ? (
              <div className="space-y-3.5 my-2">
                {monthlyTrend.map((item) => (
                  <div key={item.month} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#1E1E16] font-mono-numbers">
                        {item.month}
                      </span>
                      <div className="flex items-center gap-3 text-[11px] text-[#9B8A79]">
                        <span>{item.working_days} working days</span>
                        <span className="font-bold text-[#1E1E16] font-mono-numbers">
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                    {/* Progress Bar in earthy pottery palette */}
                    <div className="w-full h-3 bg-[#F1F0EB] rounded-full overflow-hidden border border-[#9B8A79]/30">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          item.percentage >= threshold ? 'bg-[#6C6B50]' : 'bg-[#A7674D]'
                        }`}
                        style={{ width: `${Math.min(100, item.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center text-xs text-[#9B8A79] border border-dashed border-[#9B8A79]/40 rounded-xl bg-[#F1F0EB]/50">
                <CalendarCheck className="w-6 h-6 text-[#9B8A79] mb-1" />
                <span>No monthly records submitted yet.</span>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-[#9B8A79] pt-3 border-t border-[#9B8A79]/30 mt-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6C6B50] inline-block" />
                Above {threshold}% Threshold (Eligible)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#A7674D] inline-block" />
                Below {threshold}% Threshold (Shortage)
              </span>
            </div>
          </div>

          {/* Upcoming Holidays & Quick Stats */}
          <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-heading font-medium text-[#1E1E16] tracking-tight flex items-center gap-2">
                  <CalendarOff className="w-4 h-4 text-[#A7674D]" />
                  College Holidays
                </h3>
                <button
                  onClick={() => onNavigate('holidays')}
                  className="text-xs text-[#A7674D] hover:underline font-medium cursor-pointer"
                >
                  Manage
                </button>
              </div>
              <p className="text-[11px] text-[#9B8A79] mb-3">
                Official holidays automatically excluded from student attendance percentage
              </p>

              {holidays && holidays.length > 0 ? (
                <div className="space-y-2">
                  {holidays.map((h) => (
                    <div
                      key={h.id || h.holiday_date}
                      className="p-2.5 bg-[#F1F0EB] border border-[#9B8A79]/30 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-medium text-[#1E1E16]">{h.description || 'Holiday'}</p>
                        <p className="text-[10px] text-[#9B8A79] font-mono-numbers">{h.holiday_date}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 bg-[#6C6B50] text-[#F1F0EB] rounded-md font-medium">
                        Off Day
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-[#9B8A79] border border-dashed border-[#9B8A79]/40 rounded-xl bg-[#F1F0EB]/50">
                  <CalendarOff className="w-5 h-5 text-[#9B8A79] mx-auto mb-1.5" />
                  <p>No holidays registered yet.</p>
                  <button
                    onClick={() => onNavigate('holidays')}
                    className="mt-2 text-xs text-[#A7674D] font-medium hover:underline cursor-pointer"
                  >
                    + Add College Holiday
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[#9B8A79]/30 text-xs">
              <div className="flex items-center justify-between text-[#1E1E16] font-medium">
                <span className="text-[#9B8A79]">Attendance Eligibility Cutoff:</span>
                <span className="font-mono-numbers text-sm font-bold text-[#A7674D]">{threshold}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Bottom Section: Recent Activity & Class Datasets Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Attendance Activity */}
          <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-heading font-medium text-[#1E1E16] tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#A7674D]" />
                Recent Attendance Sessions
              </h3>
              <button
                onClick={() => onNavigate('daily-attendance')}
                className="text-xs text-[#A7674D] hover:underline font-medium cursor-pointer"
              >
                Daily Register
              </button>
            </div>

            {recentDates && recentDates.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-body">
                  <thead>
                    <tr className="border-b border-[#9B8A79]/40 text-[#9B8A79] font-medium text-[11px]">
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 text-center font-medium">Present</th>
                      <th className="py-2 text-center font-medium">Absent</th>
                      <th className="py-2 text-right font-medium">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#9B8A79]/20">
                    {recentDates.map((item) => {
                      const pct = item.total > 0 ? ((item.present / item.total) * 100).toFixed(1) : '0.0';
                      return (
                        <tr key={item.attendance_date} className="hover:bg-[#F1F0EB]/60 transition-colors">
                          <td className="py-2.5 font-medium text-[#1E1E16] font-mono-numbers">
                            {item.attendance_date}
                          </td>
                          <td className="py-2.5 text-center font-bold font-mono-numbers">
                            <span className="px-2 py-0.5 rounded bg-[#6C6B50] text-[#F1F0EB]">
                              {item.present}
                            </span>
                          </td>
                          <td className="py-2.5 text-center font-bold font-mono-numbers">
                            <span className="px-2 py-0.5 rounded bg-[#F5DDD4] text-[#A7674D] border border-[#A7674D]/30">
                              {item.absent}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-bold text-[#1E1E16] font-mono-numbers">
                            {pct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-[#9B8A79] border border-dashed border-[#9B8A79]/40 rounded-xl bg-[#F1F0EB]/50">
                No recent attendance marked in this class.
              </div>
            )}
          </div>

          {/* Classes & Batches Directory */}
          <div className="bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-heading font-medium text-[#1E1E16] tracking-tight flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#A7674D]" />
                Configured Classes & Batches
              </h3>
              <span className="text-[11px] text-[#9B8A79]">{datasets.length} total</span>
            </div>

            <div className="space-y-2.5">
              {datasets.map((d) => (
                <div
                  key={d.name}
                  onClick={() => onSelectDataset(d.name)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    d.isActive
                      ? 'bg-[#F1F0EB] border-[#A7674D] shadow-xs ring-1 ring-[#A7674D]'
                      : 'bg-[#F1F0EB]/60 border-[#9B8A79]/30 hover:bg-[#F1F0EB]'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs text-[#1E1E16]">{d.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                        d.courseType === 'lab' ? 'bg-[#6C6B50] text-[#F1F0EB]' : 'bg-[#A7674D] text-[#F1F0EB]'
                      }`}>
                        {d.courseType === 'lab' ? '🔬 Lab Batch' : '🏫 Classroom'}
                      </span>
                      {d.isActive && (
                        <span className="text-[10px] px-2 py-0.5 bg-[#1E1E16] text-[#F1F0EB] rounded-md font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#9B8A79] mt-1 font-normal">
                      {d.subject || 'Course'} • Faculty: {d.faculty || 'Assigned'}
                    </p>
                  </div>

                  <div className="text-right text-xs">
                    <span className="font-bold text-[#1E1E16] font-mono-numbers">{d.studentCount}</span>
                    <span className="text-[#9B8A79] text-[11px]"> students</span>
                    <p className="text-[10px] text-[#9B8A79] font-mono-numbers">{d.markedDates} dates marked</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Semester Insight Sidebar Column on Desktop */}
      {showInsights && (
        <div className="w-full xl:w-88 shrink-0 sticky top-6">
          <SemesterInsightSidebar
            department={department || ''}
            isOpen={showInsights}
            onClose={() => setShowInsights(false)}
          />
        </div>
      )}
    </div>
  );
};
