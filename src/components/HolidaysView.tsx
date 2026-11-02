import React, { useState } from 'react';
import {
  CalendarOff,
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-react';
import { Holiday } from '../types';

interface HolidaysViewProps {
  holidays: Holiday[];
  onRefresh: () => void;
  onAddHoliday: (date: string, desc: string, replace: boolean) => Promise<void>;
  onDeleteHoliday: (date: string) => Promise<void>;
}

export const HolidaysView: React.FC<HolidaysViewProps> = ({
  holidays,
  onRefresh,
  onAddHoliday,
  onDeleteHoliday,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [holidayDate, setHolidayDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [replaceAttendance, setReplaceAttendance] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDate.trim()) {
      setFormError('Holiday date is required.');
      return;
    }
    setFormError('');
    setIsSubmitting(true);
    try {
      await onAddHoliday(holidayDate.trim(), description.trim() || 'Holiday', replaceAttendance);
      setDescription('');
      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to add holiday.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (date: string, desc: string) => {
    if (confirm(`Remove declared holiday on ${date} ("${desc}")?`)) {
      try {
        await onDeleteHoliday(date);
        onRefresh();
      } catch (err: any) {
        alert(err.message || 'Failed to delete holiday.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header Card */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E1E16]">
            Institutional Calendar
          </span>
          <h2 className="text-lg font-bold text-[#1E1E16] tracking-tight">
            Holiday Management
          </h2>
          <p className="text-xs text-[#9B8A79] mt-0.5">
            Declared holidays are automatically excluded from attendance percentages and working day requirements.
          </p>
        </div>

        <button
          onClick={() => {
            setDescription('');
            setFormError('');
            setShowAddModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-xs cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Holiday</span>
        </button>
      </div>

      {/* Holidays Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {holidays.map((h) => {
          const dateObj = new Date(h.holiday_date);
          const monthStr = dateObj.toLocaleDateString('en-US', { month: 'short' });
          const dayStr = dateObj.toLocaleDateString('en-US', { day: '2-digit' });
          const yearStr = dateObj.getFullYear();
          const weekdayStr = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

          return (
            <div
              key={h.id || h.holiday_date}
              className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-4 shadow-xs flex items-center justify-between gap-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3.5">
                {/* Calendar Tear-off Icon Box */}
                <div className="w-12 h-14 rounded-lg bg-white border border-[#9B8A79]/40 flex flex-col items-center justify-center overflow-hidden shadow-2xs shrink-0">
                  <div className="w-full bg-[#A7674D] text-[#F1F0EB] text-[9px] font-bold uppercase text-center py-0.5">
                    {monthStr}
                  </div>
                  <div className="text-base font-extrabold text-[#1E1E16] font-mono-numbers leading-tight mt-0.5">
                    {dayStr}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-[#1E1E16]">
                    {h.description || 'College Holiday'}
                  </h4>
                  <p className="text-[11px] text-[#9B8A79] font-medium">
                    {weekdayStr}, {yearStr}
                  </p>
                  <span className="text-[10px] text-[#9B8A79] font-mono-numbers">
                    {h.holiday_date}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleDelete(h.holiday_date, h.description)}
                title="Delete Holiday"
                className="p-1.5 text-[#9B8A79] hover:text-[#1E1E16] hover:bg-[#F5DDD4] rounded-md transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {holidays.length === 0 && (
        <div className="bg-[#FFFFFF] border border-dashed border-[#9B8A79]/40 rounded-xl p-12 text-center text-xs text-[#9B8A79]">
          <CalendarOff className="w-8 h-8 text-[#9B8A79] mx-auto mb-2" />
          <h4 className="text-sm font-bold text-[#1E1E16]">No Holidays Configured</h4>
          <p className="mt-1">Add official college holidays to exclude them from attendance percentages.</p>
        </div>
      )}

      {/* Modal: Add Holiday */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-[#1E1E16]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-3">
              <h3 className="text-base font-bold text-[#1E1E16] flex items-center gap-2">
                <CalendarOff className="w-4 h-4 text-[#1E1E16]" />
                Declare Holiday
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
                  Holiday Date *
                </label>
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                  Holiday Description / Occasion
                </label>
                <input
                  type="text"
                  placeholder="e.g. Gandhi Jayanti, Dussehra, National Holiday"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="replaceAttendance"
                  checked={replaceAttendance}
                  onChange={(e) => setReplaceAttendance(e.target.checked)}
                  className="w-4 h-4 text-[#1E1E16] rounded border-[#9B8A79]/40 cursor-pointer"
                />
                <label htmlFor="replaceAttendance" className="text-xs font-medium text-[#1E1E16] cursor-pointer">
                  Replace existing attendance for this date if already marked
                </label>
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
                  {isSubmitting ? 'Saving...' : 'Declare Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
