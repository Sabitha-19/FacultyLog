import React from 'react';
import {
  LayoutDashboard,
  UserCog,
  Users,
  CheckSquare,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  UserCheck,
  CalendarOff,
  UploadCloud,
  Download,
  Settings,
  GraduationCap,
  Layers,
  LogOut,
  Table
} from 'lucide-react';

export type PageId =
  | 'dashboard'
  | 'attendance-workflow'
  | 'daily-attendance'
  | 'students'
  | 'faculty-profile'
  | 'subjects'
  | 'timetable'
  | 'monthly-report'
  | 'student-report'
  | 'holidays'
  | 'bulk-import'
  | 'export'
  | 'settings';

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  activeDataset: string;
  facultyName?: string;
  department?: string;
  onLogout?: () => void;
}

const navItems: { id: PageId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'attendance-workflow', label: 'Attendance Workflow', icon: Table },
  { id: 'daily-attendance', label: 'Daily Attendance', icon: CheckSquare },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'faculty-profile', label: 'Faculty Profile', icon: UserCog },
  { id: 'subjects', label: 'Subject Hours', icon: BookOpen },
  { id: 'timetable', label: 'Weekly Timetable', icon: CalendarDays },
  { id: 'monthly-report', label: 'Monthly Report', icon: FileSpreadsheet },
  { id: 'student-report', label: 'Student Report', icon: UserCheck },
  { id: 'holidays', label: 'Holidays', icon: CalendarOff },
  { id: 'bulk-import', label: 'Bulk Import', icon: UploadCloud },
  { id: 'export', label: 'Export Reports', icon: Download },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  activeDataset,
  facultyName,
  department,
  onLogout
}) => {
  return (
    <aside
      className="w-64 shrink-0 flex flex-col justify-between select-none shadow-2xl z-20 bg-[#1E1E16] border-r border-[#9B8A79]/30 font-body"
    >
      {/* Top Branding Section */}
      <div>
        <div className="p-5 border-b border-[#9B8A79]/30 bg-[#1E1E16]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#A7674D] flex items-center justify-center text-[#F1F0EB] shadow-xs">
              <GraduationCap className="w-5 h-5 text-[#F1F0EB]" />
            </div>
            <div>
              <h1 className="text-xl font-heading font-medium tracking-tight text-[#F1F0EB] leading-tight">
                FacultyLog
              </h1>
              <p className="text-[11px] font-body text-[#9B8A79] tracking-normal leading-none mt-1">
                Smart Attendance. Simplified Academics.
              </p>
            </div>
          </div>
        </div>

        {/* Current Active Class Pill */}
        <div className="px-4 py-2.5 bg-[#1E1E16] border-b border-[#9B8A79]/20 flex items-center justify-between text-xs font-body">
          <span className="text-[#9B8A79] uppercase tracking-wider text-[10px] font-semibold">Active Class</span>
          <span className="px-2.5 py-0.5 rounded-md bg-[#6C6B50] text-[#F1F0EB] font-medium text-xs truncate max-w-[130px] font-mono-numbers">
            {activeDataset}
          </span>
        </div>

        {/* Navigation Menu */}
        <nav className="p-3 space-y-1 font-body">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs transition-all duration-150 text-left cursor-pointer ${
                  isActive
                    ? 'bg-[#A7674D] text-[#F1F0EB] font-semibold shadow-sm translate-x-0.5'
                    : 'text-[#F1F0EB] hover:text-[#F1F0EB] hover:bg-[#E4E0D5]/10 font-normal'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#F1F0EB]' : 'text-[#9B8A79]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#F1F0EB] shadow-xs" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Faculty Session & Logout */}
      <div className="p-4 border-t border-[#9B8A79]/30 text-[11px] text-[#9B8A79] bg-[#1E1E16] font-body space-y-2.5">
        {facultyName && (
          <div className="pb-2 border-b border-[#9B8A79]/20">
            <p className="text-xs font-semibold text-[#F1F0EB] truncate">{facultyName}</p>
            <p className="text-[10px] text-[#9B8A79] truncate">{department || 'Department'}</p>
          </div>
        )}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold bg-[#E4E0D5]/10 hover:bg-[#A7674D] text-[#F1F0EB] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        )}
        <div className="flex items-center justify-between pt-0.5">
          <span className="font-medium text-[#9B8A79]">FacultyLog Academic</span>
          <span className="px-2 py-0.5 rounded bg-[#6C6B50] text-[#F1F0EB] text-[10px] font-mono-numbers">
            v3.5
          </span>
        </div>
      </div>
    </aside>
  );
};
