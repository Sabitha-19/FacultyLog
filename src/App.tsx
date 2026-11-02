import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, PageId } from './components/Sidebar';
import { Header } from './components/Header';
import { FacultyLoginView } from './components/FacultyLoginView';
import { FacultyProfileView } from './components/FacultyProfileView';
import { DashboardView } from './components/DashboardView';
import { StudentsView } from './components/StudentsView';
import { DailyAttendanceView } from './components/DailyAttendanceView';
import { SubjectsView } from './components/SubjectsView';
import { TimetableView } from './components/TimetableView';
import { MonthlyReportView } from './components/MonthlyReportView';
import { StudentReportView } from './components/StudentReportView';
import { HolidaysView } from './components/HolidaysView';
import { BulkImportView } from './components/BulkImportView';
import { ExportReportsView } from './components/ExportReportsView';
import { SettingsView } from './components/SettingsView';
import { StepAttendanceWorkflowView } from './components/StepAttendanceWorkflowView';
import { apiFetch, clearStoredAuthToken } from './authClient';
import {
  DashboardStats,
  DatasetInfo,
  FacultyAuthUser,
  Student,
  Subject,
  TimetableEntry,
  Holiday
} from './types';

const VALID_PAGES: Set<PageId> = new Set([
  'dashboard',
  'attendance-workflow',
  'daily-attendance',
  'students',
  'faculty-profile',
  'subjects',
  'timetable',
  'monthly-report',
  'student-report',
  'holidays',
  'bulk-import',
  'export',
  'settings'
]);

function resolvePageFromPathname(pathname: string): PageId {
  const slug = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!slug || slug === 'login') return 'dashboard';
  if (VALID_PAGES.has(slug as PageId)) {
    return slug as PageId;
  }
  return 'dashboard';
}

export default function App() {
  const [authUser, setAuthUser] = useState<FacultyAuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  const [currentPage, setCurrentPage] = useState<PageId>(() =>
    resolvePageFromPathname(window.location.pathname)
  );
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [activeDataset, setActiveDataset] = useState<string>('Class 1');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [timetableRows, setTimetableRows] = useState<TimetableEntry[]>([]);
  const [timetableGrid, setTimetableGrid] = useState<Record<number, Record<number, any>>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [, setLoading] = useState(true);

  const resetClientDataState = useCallback(() => {
    setDatasets([]);
    setActiveDataset('Class 1');
    setStats(null);
    setStudents([]);
    setSubjects([]);
    setTimetableRows([]);
    setTimetableGrid({});
    setHolidays([]);
    setCurrentPage('dashboard');
  }, []);

  // Verify active faculty session on startup
  const verifySession = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data?.authenticated && data?.user) {
          setAuthUser(data.user);
          if (data.user.active_dataset) {
            setActiveDataset(data.user.active_dataset);
          }
          if (window.location.pathname === '/login') {
            window.history.replaceState(null, '', '/');
          }
          return;
        }
      }
      clearStoredAuthToken();
      setAuthUser(null);
      resetClientDataState();
      if (window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    } catch {
      setAuthUser(null);
      resetClientDataState();
      if (window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    } finally {
      setAuthChecking(false);
    }
  }, [resetClientDataState]);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  // Listen for 401 unauthorized events & browser back/forward navigation
  useEffect(() => {
    const onUnauthorized = () => {
      setAuthUser(null);
      resetClientDataState();
      if (window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    };

    const onPopState = () => {
      if (!authUser) {
        if (window.location.pathname !== '/login') {
          window.history.replaceState(null, '', '/login');
        }
      } else {
        setCurrentPage(resolvePageFromPathname(window.location.pathname));
      }
    };

    window.addEventListener('facultylog:unauthorized', onUnauthorized);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('facultylog:unauthorized', onUnauthorized);
      window.removeEventListener('popstate', onPopState);
    };
  }, [authUser, resetClientDataState]);

  // Navigate between internal pages and keep URL synchronized for authenticated faculty
  const handleNavigate = useCallback((page: PageId) => {
    setCurrentPage(page);
    const targetPath = page === 'dashboard' ? '/' : `/${page}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  }, []);

  const handleAuthenticated = (user: FacultyAuthUser) => {
    setAuthUser(user);
    setActiveDataset(user.active_dataset || 'Class 1');
    setCurrentPage('dashboard');
    window.history.replaceState(null, '', '/');
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Proceed with local cleanup even on network failure
    }
    clearStoredAuthToken();
    setAuthUser(null);
    resetClientDataState();
    window.history.replaceState(null, '', '/login');
  };

  // Load logged-in faculty's datasets
  const fetchDatasets = useCallback(async () => {
    if (!authUser) return;
    try {
      const res = await apiFetch('/api/datasets');
      const data = await res.json();
      if (res.ok) {
        setDatasets(data.datasets || []);
        if (data.activeDataset) {
          setActiveDataset(data.activeDataset);
        }
      }
    } catch (err) {
      console.error('Failed to fetch datasets:', err);
    }
  }, [authUser]);

  // Load logged-in faculty's active dataset data
  const fetchDatasetData = useCallback(async () => {
    if (!authUser) return;
    try {
      const [statsRes, studentsRes, subjectsRes, timetableRes, holidaysRes] = await Promise.all([
        apiFetch('/api/stats'),
        apiFetch('/api/students'),
        apiFetch('/api/subjects'),
        apiFetch('/api/timetable'),
        apiFetch('/api/holidays')
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (studentsRes.ok) {
        const sData = await studentsRes.json();
        setStudents(sData.students || []);
      }
      if (subjectsRes.ok) {
        const subjData = await subjectsRes.json();
        setSubjects(subjData.subjects || []);
      }
      if (timetableRes.ok) {
        const ttData = await timetableRes.json();
        setTimetableRows(ttData.rows || []);
        setTimetableGrid(ttData.grid || {});
      }
      if (holidaysRes.ok) {
        const hData = await holidaysRes.json();
        setHolidays(hData.holidays || []);
      }
    } catch (err) {
      console.error('Failed to load dataset details:', err);
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (authUser) {
      fetchDatasets();
    }
  }, [authUser, fetchDatasets]);

  useEffect(() => {
    if (authUser) {
      fetchDatasetData();
    }
  }, [authUser, activeDataset, fetchDatasetData]);

  // Dataset Actions
  const handleSelectDataset = async (name: string) => {
    try {
      const res = await apiFetch('/api/datasets/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        setActiveDataset(name);
        fetchDatasets();
      }
    } catch (err) {
      console.error('Failed to switch dataset:', err);
    }
  };

  const handleCreateDataset = async (
    name: string,
    courseType: 'classroom' | 'lab',
    facultyName: string,
    subject: string,
    totalHours: number
  ) => {
    const res = await apiFetch('/api/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, courseType, facultyName, subject, totalHours })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create dataset');
    setActiveDataset(data.name);
    fetchDatasets();
  };

  const handleDeleteDataset = async (name: string) => {
    const res = await apiFetch(`/api/datasets/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete dataset');
    setActiveDataset(data.activeDataset);
    fetchDatasets();
  };

  // Student Actions
  const handleAddStudent = async (regNo: string, rollNo: string, name: string) => {
    const res = await apiFetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reg_no: regNo, roll_no: rollNo, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add student');
    fetchDatasetData();
    fetchDatasets();
  };

  const handleUpdateStudent = async (
    id: number,
    regNo: string,
    rollNo: string,
    name: string,
    isActive: boolean
  ) => {
    const res = await apiFetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reg_no: regNo, roll_no: rollNo, name, is_active: isActive })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update student');
    fetchDatasetData();
  };

  const handleDeleteStudent = async (id: number) => {
    const res = await apiFetch(`/api/students/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete student');
    fetchDatasetData();
    fetchDatasets();
  };

  const handleImportStudents = async (rows: any[]) => {
    const res = await apiFetch('/api/students/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Import failed');
    fetchDatasetData();
    fetchDatasets();
    return data;
  };

  // Subject Actions
  const handleAddSubject = async (subj: Partial<Subject>) => {
    const res = await apiFetch('/api/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subj)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add subject');
    fetchDatasetData();
  };

  const handleUpdateSubject = async (id: number, subj: Partial<Subject>) => {
    const res = await apiFetch(`/api/subjects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subj)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update subject');
    fetchDatasetData();
  };

  const handleDeleteSubject = async (id: number) => {
    const res = await apiFetch(`/api/subjects/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete subject');
    fetchDatasetData();
  };

  // Timetable Actions
  const handleSetTimetableEntry = async (
    subjectId: number,
    weekday: number,
    periodNo: number,
    className: string
  ) => {
    const res = await apiFetch('/api/timetable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_id: subjectId,
        weekday,
        period_no: periodNo,
        class_name: className
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to set timetable slot');
    fetchDatasetData();
  };

  const handleClearSlot = async (weekday: number, periodNo: number, className: string) => {
    const res = await apiFetch('/api/timetable/slot', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekday, period_no: periodNo, class_name: className })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to clear slot');
    fetchDatasetData();
  };

  // Holiday Actions
  const handleAddHoliday = async (date: string, description: string, replace: boolean) => {
    const res = await apiFetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holiday_date: date, description, replace_attendance: replace })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to declare holiday');
    fetchDatasetData();
  };

  const handleDeleteHoliday = async (date: string) => {
    const res = await apiFetch(`/api/holidays/${date}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete holiday');
    fetchDatasetData();
  };

  // 1. While checking session, never expose internal pages
  if (authChecking) {
    return (
      <div className="min-h-screen w-screen bg-[#F1F0EB] text-[#1E1E16] flex items-center justify-center font-body">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-[#A7674D] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-[#9B8A79]">Verifying faculty session...</p>
        </div>
      </div>
    );
  }

  // 2. Strict Authentication Gate: Unauthenticated users see ONLY the login page
  if (!authUser) {
    return <FacultyLoginView onAuthenticated={handleAuthenticated} />;
  }

  // Page Title Mapping
  const pageDetails: Record<PageId, { title: string; desc: string }> = {
    dashboard: {
      title: 'Institutional Dashboard',
      desc: 'Overall attendance overview, monthly trend, and active class directory'
    },
    'attendance-workflow': {
      title: 'Step-by-Step Attendance Workflow',
      desc: 'Complete 3-step setup: Course Details & Students, Class Schedule, and Full Attendance Sheet'
    },
    'faculty-profile': {
      title: 'Faculty Profile & Configuration',
      desc: 'Configure faculty details, department, academic year, and subject hours'
    },
    students: {
      title: 'Student Management',
      desc: 'Manage student information, registration details, and class records'
    },
    'daily-attendance': {
      title: 'Daily Attendance Register',
      desc: 'Mark daily attendance with timetable periods, absent roll numbers, and live preview'
    },
    subjects: {
      title: 'Subject-Wise Semester Hours',
      desc: 'Configurable semester hours, weekly target periods, and syllabus completion'
    },
    timetable: {
      title: 'Weekly 8-Period Timetable',
      desc: 'Assign and manage period slots (P1 to P8) across weekdays with conflict prevention'
    },
    'monthly-report': {
      title: 'Monthly Attendance Report',
      desc: 'View class attendance trends, day-wise matrix, and monthly student performance'
    },
    'student-report': {
      title: 'Individual Student Report',
      desc: 'Individual transcript, attendance percentage, and official marks calculation'
    },
    holidays: {
      title: 'College Holidays Calendar',
      desc: 'Manage official holidays and ensure automatic exclusion from working days'
    },
    'bulk-import': {
      title: 'Bulk Attendance Import',
      desc: 'Upload multi-date attendance spreadsheets and matrices with instant validation'
    },
    export: {
      title: 'Export Reports & Workbooks',
      desc: 'Download authentic official Microsoft Excel attendance registers and CSV data'
    },
    settings: {
      title: 'System Settings',
      desc: 'Configure attendance threshold, department metadata, and manage class datasets'
    }
  };

  const currentMeta = pageDetails[currentPage] || pageDetails.dashboard;
  const resolvedFacultyName = stats?.faculty || authUser.faculty_name;
  const resolvedDepartment = stats?.department || stats?.classHandled || authUser.department;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F1F0EB] text-[#1E1E16] font-sans">
      {/* 1. Left Vertical Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        activeDataset={activeDataset}
        facultyName={resolvedFacultyName}
        department={resolvedDepartment}
        onLogout={handleLogout}
      />

      {/* 2. Main Content Viewport */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <Header
          pageTitle={currentMeta.title}
          pageDescription={currentMeta.desc}
          datasets={datasets}
          activeDataset={activeDataset}
          onSelectDataset={handleSelectDataset}
          onCreateDataset={handleCreateDataset}
          facultyName={resolvedFacultyName}
          department={resolvedDepartment}
          academicYear={stats?.academicYear}
          semester={stats?.semester}
          isConfigured={stats?.hasProfile ?? true}
          onOpenProfile={() => handleNavigate('faculty-profile')}
          onLogout={handleLogout}
        />

        {/* Scrollable View Area */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="max-w-7xl mx-auto">
            {currentPage === 'dashboard' && (
              <DashboardView
                stats={stats}
                datasets={datasets}
                onNavigate={handleNavigate}
                onSelectDataset={handleSelectDataset}
              />
            )}

            {currentPage === 'attendance-workflow' && (
              <StepAttendanceWorkflowView
                activeDataset={activeDataset}
                datasets={datasets}
                students={students}
                onRefresh={() => {
                  fetchDatasets();
                  fetchDatasetData();
                }}
                onSelectDataset={handleSelectDataset}
                onNavigateToExport={() => handleNavigate('export')}
              />
            )}

            {currentPage === 'faculty-profile' && (
              <FacultyProfileView
                activeDataset={activeDataset}
                onProfileUpdated={() => {
                  verifySession();
                  fetchDatasets();
                  fetchDatasetData();
                }}
              />
            )}

            {currentPage === 'students' && (
              <StudentsView
                students={students}
                onRefresh={() => {
                  fetchDatasets();
                  fetchDatasetData();
                }}
                onAddStudent={handleAddStudent}
                onUpdateStudent={handleUpdateStudent}
                onDeleteStudent={handleDeleteStudent}
                onImportStudents={handleImportStudents}
              />
            )}

            {currentPage === 'daily-attendance' && (
              <DailyAttendanceView
                activeDataset={activeDataset}
              />
            )}

            {currentPage === 'subjects' && (
              <SubjectsView
                subjects={subjects}
                activeDataset={activeDataset}
                onRefresh={fetchDatasetData}
                onAddSubject={handleAddSubject}
                onUpdateSubject={handleUpdateSubject}
                onDeleteSubject={handleDeleteSubject}
              />
            )}

            {currentPage === 'timetable' && (
              <TimetableView
                timetableRows={timetableRows}
                timetableGrid={timetableGrid}
                subjects={subjects}
                activeDataset={activeDataset}
                onRefresh={fetchDatasetData}
                onSetTimetableEntry={handleSetTimetableEntry}
                onClearSlot={handleClearSlot}
              />
            )}

            {currentPage === 'monthly-report' && (
              <MonthlyReportView
                activeDataset={activeDataset}
              />
            )}

            {currentPage === 'student-report' && (
              <StudentReportView
                students={students}
                activeDataset={activeDataset}
              />
            )}

            {currentPage === 'holidays' && (
              <HolidaysView
                holidays={holidays}
                onRefresh={fetchDatasetData}
                onAddHoliday={handleAddHoliday}
                onDeleteHoliday={handleDeleteHoliday}
              />
            )}

            {currentPage === 'bulk-import' && (
              <BulkImportView
                students={students}
                activeDataset={activeDataset}
                onRefresh={fetchDatasetData}
              />
            )}

            {currentPage === 'export' && (
              <ExportReportsView
                datasets={datasets}
                activeDataset={activeDataset}
              />
            )}

            {currentPage === 'settings' && (
              <SettingsView
                datasets={datasets}
                activeDataset={activeDataset}
                onRefresh={() => {
                  verifySession();
                  fetchDatasets();
                  fetchDatasetData();
                }}
                onDeleteDataset={handleDeleteDataset}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
