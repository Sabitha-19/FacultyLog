import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Clock,
  Target,
  CheckCircle2,
  Percent,
  Calendar,
  X,
  AlertCircle
} from 'lucide-react';
import { Subject } from '../types';

interface SubjectsViewProps {
  subjects: Subject[];
  activeDataset: string;
  onRefresh: () => void;
  onAddSubject: (subj: Partial<Subject>) => Promise<void>;
  onUpdateSubject: (id: number, subj: Partial<Subject>) => Promise<void>;
  onDeleteSubject: (id: number) => Promise<void>;
}

export const SubjectsView: React.FC<SubjectsViewProps> = ({
  subjects,
  activeDataset,
  onRefresh,
  onAddSubject,
  onUpdateSubject,
  onDeleteSubject,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [semesterHours, setSemesterHours] = useState<number>(45);
  const [weeklyTarget, setWeeklyTarget] = useState<number>(3);
  const [periodDurationMins, setPeriodDurationMins] = useState<number>(60);
  const [semester, setSemester] = useState('Semester 5');
  const [classSection, setClassSection] = useState(activeDataset);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Subject name is required.');
      return;
    }
    if (semesterHours <= 0) {
      setFormError('Semester hours must be a positive number.');
      return;
    }
    setFormError('');
    setIsSubmitting(true);
    try {
      await onAddSubject({
        name: name.trim(),
        code: (code || name.slice(0, 6)).trim().toUpperCase(),
        semester_hours: semesterHours,
        weekly_target: weeklyTarget,
        period_duration_mins: periodDurationMins,
        semester,
        class_section: classSection || activeDataset
      });
      setName('');
      setCode('');
      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to add subject.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;
    if (!name.trim()) {
      setFormError('Subject name is required.');
      return;
    }
    if (semesterHours <= 0) {
      setFormError('Semester hours must be a positive number.');
      return;
    }
    setFormError('');
    setIsSubmitting(true);
    try {
      await onUpdateSubject(editingSubject.id, {
        name: name.trim(),
        code: (code || name.slice(0, 6)).trim().toUpperCase(),
        semester_hours: semesterHours,
        weekly_target: weeklyTarget,
        period_duration_mins: periodDurationMins,
        semester,
        class_section: classSection || activeDataset
      });
      setEditingSubject(null);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update subject.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (subj: Subject) => {
    setEditingSubject(subj);
    setName(subj.name);
    setCode(subj.code);
    setSemesterHours(subj.semester_hours);
    setWeeklyTarget(subj.weekly_target);
    setPeriodDurationMins(subj.period_duration_mins || 60);
    setSemester(subj.semester || 'Semester 5');
    setClassSection(subj.class_section || activeDataset);
    setFormError('');
  };

  const handleDelete = async (id: number, subjName: string) => {
    if (confirm(`Are you sure you want to delete subject "${subjName}"? Timetable entries for this subject will also be removed.`)) {
      try {
        await onDeleteSubject(id);
        onRefresh();
      } catch (err: any) {
        alert(err.message || 'Failed to delete subject.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Card */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E1E16]">
            Curriculum Hours Management
          </span>
          <h2 className="text-lg font-bold text-[#1E1E16] tracking-tight">
            Subject-Wise Semester Hours & Progress
          </h2>
          <p className="text-xs text-[#9B8A79] mt-0.5">
            Configure total semester hours, weekly period targets, and track completed vs remaining hours for each subject.
          </p>
        </div>

        <button
          onClick={() => {
            setName('');
            setCode('');
            setSemesterHours(45);
            setWeeklyTarget(3);
            setPeriodDurationMins(60);
            setSemester('Semester 5');
            setClassSection(activeDataset);
            setFormError('');
            setShowAddModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-xs cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add New Subject</span>
        </button>
      </div>

      {/* Subjects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {subjects.map((subj) => {
          const isComplete = subj.completion_pct >= 100;
          return (
            <div
              key={subj.id}
              className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                {/* Header & Badges */}
                <div className="flex items-start justify-between gap-2 border-b border-[#9B8A79]/40 pb-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#1E1E16] tracking-tight">
                        {subj.name}
                      </h3>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F1F0EB] text-[#1E1E16] font-semibold">
                        {subj.code || 'CODE'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#9B8A79] mt-0.5">
                      {subj.semester} • {subj.class_section || activeDataset}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(subj)}
                      title="Edit Subject"
                      className="p-1 text-[#9B8A79] hover:text-[#1E1E16] hover:bg-[#F1F0EB]/30 rounded-md transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(subj.id, subj.name)}
                      title="Delete Subject"
                      className="p-1 text-[#9B8A79] hover:text-[#1E1E16] hover:bg-[#F5DDD4] rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4 text-xs font-mono-numbers">
                  {/* Total Allocated */}
                  <div className="p-2.5 bg-white border border-[#9B8A79]/40 rounded-lg">
                    <span className="text-[10px] text-[#9B8A79] block font-sans uppercase font-semibold">
                      Allocated Hours
                    </span>
                    <span className="text-base font-bold text-[#1E1E16]">
                      {subj.semester_hours} hrs
                    </span>
                  </div>

                  {/* Completed Hours */}
                  <div className="p-2.5 bg-[#E4E0D5] border border-[#9B8A79]/40 rounded-lg">
                    <span className="text-[10px] text-[#1E1E16] block font-sans uppercase font-semibold">
                      Completed Hours
                    </span>
                    <span className="text-base font-bold text-[#1E1E16]">
                      {subj.completed_hours} hrs
                    </span>
                  </div>

                  {/* Remaining Hours */}
                  <div className="p-2.5 bg-white border border-[#9B8A79]/40 rounded-lg">
                    <span className="text-[10px] text-[#9B8A79] block font-sans uppercase font-semibold">
                      Remaining Hours
                    </span>
                    <span className="text-base font-bold text-[#1E1E16]">
                      {subj.remaining_hours} hrs
                    </span>
                  </div>

                  {/* Weekly Target vs Scheduled */}
                  <div className="p-2.5 bg-white border border-[#9B8A79]/40 rounded-lg">
                    <span className="text-[10px] text-[#9B8A79] block font-sans uppercase font-semibold">
                      Weekly Target
                    </span>
                    <span className="text-base font-bold text-[#1E1E16]">
                      {subj.weekly_scheduled_periods} / {subj.weekly_target} periods
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-[#9B8A79]">
                      Syllabus Hours Progress
                    </span>
                    <span className="font-bold text-[#1E1E16] font-mono-numbers">
                      {subj.completion_pct}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-[#F1F0EB]/60 rounded-full overflow-hidden border border-[#9B8A79]/40">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isComplete ? 'bg-[#1E1E16]' : 'bg-[#1E1E16]'
                      }`}
                      style={{ width: `${Math.min(100, subj.completion_pct)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer details */}
              <div className="pt-3 border-t border-[#9B8A79]/40 mt-4 flex items-center justify-between text-[11px] text-[#9B8A79]">
                <span>{subj.completed_sessions} saved sessions</span>
                <span>{subj.period_duration_mins || 60} mins / period</span>
              </div>
            </div>
          );
        })}
      </div>

      {subjects.length === 0 && (
        <div className="bg-[#FFFFFF] border border-dashed border-[#9B8A79]/40 rounded-xl p-12 text-center text-xs text-[#9B8A79]">
          <BookOpen className="w-8 h-8 text-[#9B8A79] mx-auto mb-2" />
          <h4 className="text-sm font-bold text-[#1E1E16]">No Subjects Added Yet</h4>
          <p className="mt-1">Add your semester subjects to start tracking allocated vs completed hours.</p>
        </div>
      )}

      {/* Modal: Add Subject */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-[#1E1E16]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-3">
              <h3 className="text-base font-bold text-[#1E1E16] flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#1E1E16]" />
                Add New Subject
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#9B8A79] hover:text-[#1E1E16]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-2.5 bg-[#F5DDD4] border border-[#1E1E16] text-[#1E1E16] text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                  Subject Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Database Management Systems, Computer Networks"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                    Subject Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 21CS51"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                    Total Semester Hours *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="300"
                    value={semesterHours}
                    onChange={(e) => setSemesterHours(parseFloat(e.target.value) || 45)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                    Weekly Period Target *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={weeklyTarget}
                    onChange={(e) => setWeeklyTarget(parseInt(e.target.value, 10) || 3)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                    Period Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="180"
                    value={periodDurationMins}
                    onChange={(e) => setPeriodDurationMins(parseInt(e.target.value, 10) || 60)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                    Semester
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Semester 5"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                    Class / Section
                  </label>
                  <input
                    type="text"
                    value={classSection}
                    onChange={(e) => setClassSection(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#9B8A79]/40">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-[#1E1E16] hover:bg-[#F1F0EB]/30 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Subject */}
      {editingSubject && (
        <div className="fixed inset-0 z-50 bg-[#1E1E16]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-3">
              <h3 className="text-base font-bold text-[#1E1E16] flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#1E1E16]" />
                Edit Subject Details
              </h3>
              <button onClick={() => setEditingSubject(null)} className="text-[#9B8A79] hover:text-[#1E1E16]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-2.5 bg-[#F5DDD4] border border-[#1E1E16] text-[#1E1E16] text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                  Subject Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                    Subject Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                    Total Semester Hours *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="300"
                    value={semesterHours}
                    onChange={(e) => setSemesterHours(parseFloat(e.target.value) || 45)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                    Weekly Period Target *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={weeklyTarget}
                    onChange={(e) => setWeeklyTarget(parseInt(e.target.value, 10) || 3)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                    Period Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="180"
                    value={periodDurationMins}
                    onChange={(e) => setPeriodDurationMins(parseInt(e.target.value, 10) || 60)}
                    className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#9B8A79]/40">
                <button
                  type="button"
                  onClick={() => setEditingSubject(null)}
                  className="px-4 py-2 text-xs font-medium text-[#1E1E16] hover:bg-[#F1F0EB]/30 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Updating...' : 'Update Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
