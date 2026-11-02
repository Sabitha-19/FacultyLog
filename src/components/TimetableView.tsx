import React, { useState } from 'react';
import {
  CalendarDays,
  Plus,
  Trash2,
  AlertTriangle,
  Clock,
  BookOpen,
  CheckCircle2,
  X
} from 'lucide-react';
import { Subject, TimetableEntry } from '../types';

interface TimetableViewProps {
  timetableRows: TimetableEntry[];
  timetableGrid: Record<number, Record<number, any>>;
  subjects: Subject[];
  activeDataset: string;
  onRefresh: () => void;
  onSetTimetableEntry: (subjectId: number, weekday: number, periodNo: number, className: string) => Promise<void>;
  onClearSlot: (weekday: number, periodNo: number, className: string) => Promise<void>;
}

export const TimetableView: React.FC<TimetableViewProps> = ({
  timetableRows,
  timetableGrid,
  subjects,
  activeDataset,
  onRefresh,
  onSetTimetableEntry,
  onClearSlot,
}) => {
  const [selectedWeekday, setSelectedWeekday] = useState<number>(0);
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(subjects[0]?.id || 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const days = [
    { id: 0, label: 'Monday', short: 'Mon' },
    { id: 1, label: 'Tuesday', short: 'Tue' },
    { id: 2, label: 'Wednesday', short: 'Wed' },
    { id: 3, label: 'Thursday', short: 'Thu' },
    { id: 4, label: 'Friday', short: 'Fri' },
    { id: 5, label: 'Saturday', short: 'Sat' },
    { id: 6, label: 'Sunday', short: 'Sun' },
  ];

  const periods = [1, 2, 3, 4, 5, 6, 7, 8];

  const handleAssignSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) {
      setMessage({ type: 'error', text: 'Select a subject to assign.' });
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onSetTimetableEntry(selectedSubjectId, selectedWeekday, selectedPeriod, activeDataset);
      setMessage({
        type: 'success',
        text: `Assigned Period P${selectedPeriod} on ${days[selectedWeekday].label} successfully!`
      });
      setShowAssignModal(false);
      onRefresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update timetable.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCellClick = (w: number, p: number) => {
    setSelectedWeekday(w);
    setSelectedPeriod(p);
    const existing = timetableGrid[w]?.[p];
    if (existing) {
      setSelectedSubjectId(existing.subject_id);
    } else if (subjects[0]) {
      setSelectedSubjectId(subjects[0].id);
    }
    setShowAssignModal(true);
  };

  const handleClearSlot = async (w: number, p: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onClearSlot(w, p, activeDataset);
      onRefresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to clear slot.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E1E16]">
            Academic Schedule
          </span>
          <h2 className="text-lg font-bold text-[#1E1E16] tracking-tight">
            Weekly 8-Period Timetable Grid
          </h2>
          <p className="text-xs text-[#9B8A79] mt-0.5">
            Configure periods 1 through 8 for each weekday. Attendance sessions will automatically load these assigned periods.
          </p>
        </div>

        <button
          onClick={() => {
            setSelectedWeekday(0);
            setSelectedPeriod(1);
            if (subjects[0]) setSelectedSubjectId(subjects[0].id);
            setShowAssignModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-xs cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Assign Period Slot</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-[#E4E0D5] border-[#9B8A79]/40 text-[#1E1E16]'
              : 'bg-[#F5DDD4] border-[#1E1E16] text-[#1E1E16]'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="font-bold px-1.5 py-0.5">✕</button>
        </div>
      )}

      {/* Timetable Grid Table */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#9B8A79]/40 flex items-center justify-between bg-[#F1F0EB]/30">
          <span className="text-xs font-bold text-[#1E1E16] flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#1E1E16]" />
            Timetable Schedule: {activeDataset}
          </span>
          <span className="text-[11px] text-[#9B8A79]">
            Click any period slot to assign or reassign subjects
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr className="bg-[#F1F0EB]/60 border-b border-[#9B8A79]/40 text-[#1E1E16] text-[11px] font-bold">
                <th className="py-3 px-3 text-left w-28 uppercase tracking-wider">Day / Period</th>
                {periods.map((p) => (
                  <th key={p} className="py-3 px-2 border-l border-[#9B8A79]/40">
                    <span className="block font-mono-numbers">P{p}</span>
                    <span className="text-[9px] font-normal text-[#9B8A79]">Period {p}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#9B8A79]/25 text-xs">
              {days.map((d) => (
                <tr key={d.id} className="hover:bg-white/40 transition-colors">
                  {/* Day Row Header */}
                  <td className="py-3 px-3 text-left font-bold text-[#1E1E16] bg-[#F1F0EB]/20 border-r border-[#9B8A79]/40">
                    <span className="block text-xs">{d.label}</span>
                    <span className="text-[10px] text-[#9B8A79]">{d.short}</span>
                  </td>

                  {/* 8 Period Columns */}
                  {periods.map((p) => {
                    const entry = timetableGrid[d.id]?.[p];
                    return (
                      <td
                        key={p}
                        onClick={() => handleCellClick(d.id, p)}
                        className={`py-2 px-1.5 border-l border-[#9B8A79]/40 transition-all cursor-pointer relative group ${
                          entry
                            ? 'bg-[#E4E0D5]/60 hover:bg-[#E4E0D5]'
                            : 'hover:bg-white/80'
                        }`}
                      >
                        {entry ? (
                          <div className="p-2 rounded-lg bg-white border border-[#9B8A79]/40 shadow-2xs text-left relative flex flex-col justify-between min-h-[62px]">
                            <div>
                              <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-[#A7674D] text-[#F1F0EB] font-bold leading-none inline-block">
                                {entry.subject_code || 'SUBJ'}
                              </span>
                              <p className="text-[11px] font-bold text-[#1E1E16] truncate mt-1 leading-tight" title={entry.subject_name}>
                                {entry.subject_name}
                              </p>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-[#1E1E16] font-semibold mt-1">
                              <span>P{p}</span>
                              <button
                                type="button"
                                onClick={(e) => handleClearSlot(d.id, p, e)}
                                title="Remove Period"
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-[#1E1E16] hover:bg-[#F5DDD4] rounded transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="h-[62px] flex items-center justify-center text-[#9B8A79]/40 hover:text-[#1E1E16] text-[11px] font-medium border border-dashed border-transparent hover:border-[#9B8A79]/40 rounded-lg">
                            <span className="opacity-0 group-hover:opacity-100">+ Add</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subject Target Summary Cards */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#1E1E16] mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#1E1E16]" />
          Weekly Target Fulfillment
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {subjects.map((s) => {
            const scheduledCount = timetableRows.filter(r => r.subject_id === s.id).length;
            const target = s.weekly_target || 3;
            const matches = scheduledCount === target;
            return (
              <div key={s.id} className="p-3 bg-white border border-[#9B8A79]/40 rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#1E1E16]">{s.name}</span>
                  <p className="text-[11px] text-[#9B8A79]">Target: {target} periods/week</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold font-mono-numbers px-2 py-0.5 rounded-md ${
                    matches
                      ? 'bg-[#E4E0D5] text-[#1E1E16] border border-[#9B8A79]/40'
                      : 'bg-[#E4E0D5] text-[#1E1E16] border border-[#9B8A79]/40'
                  }`}>
                    {scheduledCount} / {target}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Assign Slot */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-[#1E1E16]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-3">
              <h3 className="text-base font-bold text-[#1E1E16] flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#1E1E16]" />
                Assign Period Slot
              </h3>
              <button onClick={() => setShowAssignModal(false)} className="text-[#9B8A79] hover:text-[#1E1E16]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAssignSlot} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                  Day of the Week
                </label>
                <select
                  value={selectedWeekday}
                  onChange={(e) => setSelectedWeekday(parseInt(e.target.value, 10))}
                  className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                >
                  {days.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                  Period Number (1 to 8)
                </label>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(parseInt(e.target.value, 10))}
                  className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                >
                  {periods.map(p => (
                    <option key={p} value={p}>
                      Period P{p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                  Assign Subject
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(parseInt(e.target.value, 10))}
                  className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  required
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || 'CODE'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#9B8A79]/40">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-xs font-medium text-[#1E1E16] hover:bg-[#F1F0EB]/30 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
