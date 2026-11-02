export interface FacultyAuthUser {
  id: number;
  email: string;
  faculty_name: string;
  department: string;
  active_dataset: string;
}

export interface Student {
  id: number;
  reg_no: string;
  roll_no?: string;
  name: string;
  is_active: number | boolean;
  created_at?: string;
  sNo?: number;
  workingDays?: number;
  present?: number;
  absent?: number;
  od?: number;
  leave?: number;
  attendancePct?: number;
  marks?: number;
  status?: string;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  semester_hours: number;
  weekly_target: number;
  period_duration_mins: number;
  semester: string;
  class_section: string;
  created_at?: string;
  completed_hours: number;
  remaining_hours: number;
  completion_pct: number;
  weekly_scheduled_periods: number;
  completed_sessions: number;
}

export interface TimetableEntry {
  id: number;
  subject_id: number;
  weekday: number; // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  period_no: number; // 1 to 8
  class_name: string;
  subject_name?: string;
  subject_code?: string;
  semester_hours?: number;
  weekly_target?: number;
}

export interface FacultyProfile {
  faculty_name: string;
  department: string;
  academic_year: string;
  year_of_study: string;
  semester: string;
  class_section: string;
  default_subject_name?: string;
  default_total_hours?: number;
  default_weekly_target?: number;
  default_period_duration?: number;
  is_configured: boolean;
}

export interface AttendanceSession {
  session_id: number;
  class_id: string;
  subject_id: number;
  attendance_date: string;
  period_number: number;
  period_duration: number;
  created_at?: string;
  updated_at?: string;
  subject_name?: string;
  subject_code?: string;
  present_count?: number;
  absent_count?: number;
  od_count?: number;
  leave_count?: number;
  total_count?: number;
}

export interface AttendanceRecord {
  record_id?: number;
  session_id: number;
  student_id: number;
  status: 'P' | 'A' | 'OD' | 'L';
  reg_no?: string;
  roll_no?: string;
  name?: string;
}

export interface DatasetInfo {
  name: string;
  studentCount: number;
  markedDates: number;
  sessionCount?: number;
  courseType: 'classroom' | 'lab';
  faculty: string;
  subject: string;
  classHandled: string;
  isActive: boolean;
}

export interface Holiday {
  id: number;
  holiday_date: string;
  description: string;
  created_at?: string;
}

export interface DashboardStats {
  activeDataset: string;
  faculty: string;
  department?: string;
  academicYear?: string;
  yearOfStudy?: string;
  semester?: string;
  classSection?: string;
  subject: string;
  courseType: 'classroom' | 'lab';
  classHandled?: string;
  threshold: number;
  totalStudents: number;
  totalDatasets: number;
  totalWorkingDays: number;
  totalSessions: number;
  overallAttendancePct: number;
  hasProfile: boolean;
  todayAttendance: {
    date: string;
    isMarked: boolean;
    present: number;
    absent: number;
    od?: number;
    leave?: number;
    total: number;
  };
  recentDates: {
    attendance_date: string;
    present: number;
    absent: number;
    total: number;
  }[];
  monthlyTrend: {
    month: string;
    working_days: number;
    percentage: number;
  }[];
  holidays: Holiday[];
}

export interface MonthlySummaryStudent {
  id: number;
  sNo: number;
  rollNo?: string;
  regNo: string;
  name: string;
  isActive: boolean;
  workingDays: number;
  present: number;
  absent: number;
  od?: number;
  leave?: number;
  attendancePct: number;
  isLow: boolean;
  marks: number;
  dayStatuses: Record<string, string>;
}

export interface MonthlyReportData {
  year: number;
  month: number;
  start: string;
  end: string;
  workingDaysCount: number;
  submittedDates: string[];
  holidays: { holiday_date: string; description: string }[];
  threshold: number;
  monthDays: string[];
  summary: MonthlySummaryStudent[];
}

export interface StudentDetailReport {
  student: Student;
  stats: {
    workingDays: number;
    present: number;
    absent: number;
    od?: number;
    leave?: number;
    holidays: number;
    attendancePct: number;
    marks: number;
    courseType: string;
  };
  monthlyStats: {
    month: string;
    total_sessions: number;
    present: number;
    absent: number;
  }[];
  logs: {
    attendance_date: string;
    status: string;
    period_no: number;
    subject_name: string;
  }[];
}
