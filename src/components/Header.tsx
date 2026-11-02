import React, { useState } from 'react';
import {
  Calendar,
  Layers,
  LogOut,
  Plus,
  User,
  X
} from 'lucide-react';
import { DatasetInfo } from '../types';

interface HeaderProps {
  pageTitle: string;
  pageDescription: string;
  datasets: DatasetInfo[];
  activeDataset: string;
  onSelectDataset: (name: string) => void;
  onCreateDataset: (name: string, courseType: 'classroom' | 'lab', facultyName: string, subject: string, totalHours: number) => Promise<void>;
  facultyName: string;
  department: string;
  academicYear?: string;
  semester?: string;
  isConfigured?: boolean;
  onOpenProfile?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  pageTitle,
  pageDescription,
  datasets,
  activeDataset,
  onSelectDataset,
  onCreateDataset,
  facultyName,
  department,
  academicYear,
  semester,
  isConfigured = true,
  onOpenProfile,
  onLogout,
}) => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [newCourseType, setNewCourseType] = useState<'classroom' | 'lab'>('classroom');
  const [newSubject, setNewSubject] = useState('');
  const [newTotalHours, setNewTotalHours] = useState(45);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const todayStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date());

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDatasetName.trim()) {
      setErrorMsg('Class / Dataset name is required.');
      return;
    }
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await onCreateDataset(newDatasetName.trim(), newCourseType, facultyName, newSubject || 'Subject', newTotalHours);
      setNewDatasetName('');
      setNewSubject('');
      setShowNewModal(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create dataset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <header className="bg-[#F1F0EB] border-b border-[#9B8A79]/30 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-10 shadow-xs font-body">
      {/* Left Zone: Title & Description */}
      <div>
        <h2 className="text-2xl font-heading font-medium text-[#1E1E16] tracking-tight leading-tight">
          {pageTitle}
        </h2>
        <p className="text-xs text-[#9B8A79] mt-0.5 font-normal">
          {pageDescription}
        </p>
      </div>

      {/* Right Zone: Controls, Dataset Switcher, Date, Faculty */}
      <div className="flex items-center gap-3">
        {/* Dataset Switcher Dropdown */}
        <div className="flex items-center bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-xl p-1 shadow-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#1E1E16] font-medium">
            <Layers className="w-3.5 h-3.5 text-[#A7674D]" />
            <select
              value={activeDataset}
              onChange={(e) => onSelectDataset(e.target.value)}
              className="bg-transparent text-xs font-medium text-[#1E1E16] focus:outline-none cursor-pointer pr-1"
            >
              {datasets.map(d => (
                <option key={d.name} value={d.name} className="bg-[#F1F0EB] text-[#1E1E16]">
                  {d.name} ({d.studentCount} std • {d.courseType === 'lab' ? 'Lab' : 'Class'})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            title="Create New Class Dataset"
            className="p-1.5 bg-[#A7674D] text-[#F1F0EB] hover:bg-[#6C6B50] rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>

        {/* Date Display */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-xl text-xs text-[#1E1E16] font-medium font-mono-numbers shadow-xs">
          <Calendar className="w-3.5 h-3.5 text-[#9B8A79]" />
          <span>{todayStr}</span>
        </div>

        {/* Faculty Badge & Quick Profile Link */}
        <button
          onClick={onOpenProfile}
          title="Click to view or edit Faculty Profile"
          className="flex items-center gap-2.5 px-3 py-1.5 bg-[#E4E0D5] hover:bg-[#E4E0D5]/80 border border-[#9B8A79]/40 rounded-xl text-xs text-[#1E1E16] transition-colors cursor-pointer shadow-xs"
        >
          <div className="w-6 h-6 rounded-lg bg-[#A7674D] flex items-center justify-center text-[#F1F0EB] font-bold">
            <User className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
          <div className="flex flex-col text-left leading-none">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[11px] text-[#1E1E16]">{facultyName || 'Faculty Profile'}</span>
              {!isConfigured && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#A7674D]" title="Setup required" />
              )}
            </div>
            <span className="text-[10px] text-[#9B8A79]">
              {department || (isConfigured ? 'Academic Dept' : 'Setup Profile')}
              {semester ? ` • ${semester}` : ''}
            </span>
          </div>
        </button>

        {/* Logout Button */}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            title="Sign out of FacultyLog"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#E4E0D5] hover:bg-[#A7674D] text-[#1E1E16] hover:text-[#F1F0EB] border border-[#9B8A79]/40 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        )}
      </div>

      {/* Modal: New Dataset */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-[#1E1E16]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#F1F0EB] border border-[#9B8A79]/40 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150 text-[#1E1E16]">
            <div className="flex items-center justify-between border-b border-[#9B8A79]/30 pb-3">
              <h3 className="text-lg font-heading font-medium text-[#1E1E16] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#A7674D]" />
                Create New Class Dataset
              </h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-[#9B8A79] hover:text-[#1E1E16] p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-3 p-2.5 bg-[#F5DDD4] border border-[#A7674D] text-[#A7674D] text-xs font-medium rounded-xl">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#1E1E16] mb-1">
                  Class / Dataset Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Class 2, ISE Section B, CN Lab Batch-3"
                  value={newDatasetName}
                  onChange={(e) => setNewDatasetName(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-xl text-[#1E1E16] font-medium focus:outline-none focus:ring-1 focus:ring-[#A7674D]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1E1E16] mb-1">
                  Course Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCourseType('classroom')}
                    className={`py-2 px-3 text-xs font-medium rounded-xl border text-center cursor-pointer transition-all ${
                      newCourseType === 'classroom'
                        ? 'bg-[#A7674D] text-[#F1F0EB] border-[#A7674D] shadow-xs'
                        : 'bg-[#E4E0D5] text-[#1E1E16] border-[#9B8A79]/40'
                    }`}
                  >
                    🏫 Classroom (Theory)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCourseType('lab')}
                    className={`py-2 px-3 text-xs font-medium rounded-xl border text-center cursor-pointer transition-all ${
                      newCourseType === 'lab'
                        ? 'bg-[#A7674D] text-[#F1F0EB] border-[#A7674D] shadow-xs'
                        : 'bg-[#E4E0D5] text-[#1E1E16] border-[#9B8A79]/40'
                    }`}
                  >
                    🔬 Laboratory
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1E1E16] mb-1">
                  Subject Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Database Management Systems"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-xl text-[#1E1E16] font-medium focus:outline-none focus:ring-1 focus:ring-[#A7674D]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1E1E16] mb-1">
                  Semester Hours Target
                </label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={newTotalHours}
                  onChange={(e) => setNewTotalHours(parseInt(e.target.value, 10) || 45)}
                  className="w-full text-xs px-3 py-2 bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-xl text-[#1E1E16] font-medium focus:outline-none focus:ring-1 focus:ring-[#A7674D]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#9B8A79]/30">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs font-medium text-[#9B8A79] hover:bg-[#E4E0D5] rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] rounded-xl transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  {isSubmitting ? 'Creating...' : 'Create Dataset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
