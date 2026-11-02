import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  CheckCircle2,
  Trash2,
  Layers,
  Database,
  Sliders,
  AlertTriangle
} from 'lucide-react';
import { DatasetInfo } from '../types';
import { apiFetch } from '../authClient';

interface SettingsViewProps {
  datasets: DatasetInfo[];
  activeDataset: string;
  onRefresh: () => void;
  onDeleteDataset: (name: string) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  datasets,
  activeDataset,
  onRefresh,
  onDeleteDataset,
}) => {
  const [threshold, setThreshold] = useState('75');
  const [classHandled, setClassHandled] = useState('');
  const [facultyName, setFacultyName] = useState('');
  const [subject, setSubject] = useState('');
  const [totalHours, setTotalHours] = useState('45');
  const [courseType, setCourseType] = useState('classroom');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/settings');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load settings');
      setThreshold(data.low_attendance_threshold || '75');
      setClassHandled(data.course_class_handled || '');
      setFacultyName(data.course_faculty_name || '');
      setSubject(data.course_subject || '');
      setTotalHours(data.course_total_hours || '45');
      setCourseType(data.course_type || 'classroom');
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [activeDataset]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          low_attendance_threshold: threshold,
          course_class_handled: classHandled,
          course_faculty_name: facultyName,
          course_subject: subject,
          course_total_hours: totalHours,
          course_type: courseType
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      setMessage({ type: 'success', text: 'Settings updated successfully!' });
      onRefresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClass = async (name: string) => {
    if (datasets.length <= 1) {
      setMessage({ type: 'error', text: 'Cannot delete the only remaining dataset.' });
      return;
    }
    try {
      await onDeleteDataset(name);
      onRefresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete dataset.' });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Banner */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E1E16]">
          Configuration
        </span>
        <h2 className="text-lg font-bold text-[#1E1E16] tracking-tight">
          System & Institutional Settings
        </h2>
        <p className="text-xs text-[#9B8A79] mt-0.5">
          Configure institutional thresholds, department metadata, and manage database files.
        </p>
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

      {/* Group 1: Academic Settings Form */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-[#1E1E16] flex items-center gap-2 border-b border-[#9B8A79]/40 pb-3">
            <Sliders className="w-4 h-4 text-[#1E1E16]" />
            Attendance Criteria & Threshold
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                Low Attendance Threshold (%) *
              </label>
              <input
                type="number"
                min="10"
                max="100"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                required
              />
              <p className="text-[11px] text-[#9B8A79] mt-1">
                Students below this percentage will be flagged with warning badges across all reports.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                Course Type
              </label>
              <select
                value={courseType}
                onChange={(e) => setCourseType(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              >
                <option value="classroom">🏫 Classroom (Theory: -1 mark / 3 absences)</option>
                <option value="lab">🔬 Laboratory (-1 mark / 1 day absent)</option>
              </select>
              <p className="text-[11px] text-[#9B8A79] mt-1">
                Determines the grading scale used for calculating attendance marks out of 5.
              </p>
            </div>
          </div>
        </div>

        {/* Group 2: Faculty & Course Metadata */}
        <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-[#1E1E16] flex items-center gap-2 border-b border-[#9B8A79]/40 pb-3">
            <Database className="w-4 h-4 text-[#1E1E16]" />
            Course & Faculty Profile
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                Class / Department Handled
              </label>
              <input
                type="text"
                value={classHandled}
                onChange={(e) => setClassHandled(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                Faculty Name
              </label>
              <input
                type="text"
                value={facultyName}
                onChange={(e) => setFacultyName(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                Primary Course / Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                Default Total Hours Target
              </label>
              <input
                type="number"
                value={totalHours}
                onChange={(e) => setTotalHours(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Group 3: Dataset Management */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-[#1E1E16] flex items-center gap-2 border-b border-[#9B8A79]/40 pb-3">
          <Layers className="w-4 h-4 text-[#1E1E16]" />
          Manage Class Datasets
        </h3>

        <div className="divide-y divide-[#9B8A79]/20">
          {datasets.map((d) => (
            <div key={d.name} className="py-3 flex items-center justify-between text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#1E1E16]">{d.name}</span>
                  {d.isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-[#A7674D] text-[#F1F0EB] rounded font-bold">
                      Active
                    </span>
                  )}
                  <span className="text-[10px] text-[#9B8A79]">
                    ({d.courseType === 'lab' ? 'Lab Batch' : 'Classroom'})
                  </span>
                </div>
                <p className="text-[11px] text-[#9B8A79] mt-0.5">
                  {d.studentCount} students enrolled • {d.markedDates} dates marked
                </p>
              </div>

              {datasets.length > 1 && (
                <button
                  onClick={() => handleDeleteClass(d.name)}
                  title="Delete Dataset"
                  className="p-1.5 text-[#9B8A79] hover:text-[#1E1E16] hover:bg-[#F5DDD4] rounded-md transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
