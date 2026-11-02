import React, { useState, useEffect } from 'react';
import {
  User,
  GraduationCap,
  Building,
  Calendar,
  BookOpen,
  Clock,
  Target,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw
} from 'lucide-react';
import { FacultyProfile } from '../types';
import { apiFetch } from '../authClient';

interface FacultyProfileViewProps {
  onProfileUpdated?: () => void;
  activeDataset: string;
}

export const FacultyProfileView: React.FC<FacultyProfileViewProps> = ({
  onProfileUpdated,
  activeDataset
}) => {
  const [profile, setProfile] = useState<FacultyProfile>({
    faculty_name: '',
    department: '',
    academic_year: '2026-2027',
    year_of_study: '4th Year (Final Year)',
    semester: 'Semester 7',
    class_section: activeDataset || 'Class 1',
    default_subject_name: '',
    default_total_hours: 45,
    default_weekly_target: 3,
    default_period_duration: 60,
    is_configured: false
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load existing profile from SQLite
  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/profile');
      const data = await res.json();
      if (res.ok && data.profile) {
        setProfile({
          ...data.profile,
          class_section: data.profile.class_section || activeDataset,
          default_total_hours: data.profile.default_total_hours || 45,
          default_weekly_target: data.profile.default_weekly_target || 3,
          default_period_duration: data.profile.default_period_duration || 60,
          is_configured: true
        });
      }
    } catch (err: any) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.faculty_name.trim()) {
      setMessage({ type: 'error', text: 'Faculty Name is required.' });
      return;
    }
    if (!profile.department.trim()) {
      setMessage({ type: 'error', text: 'Department Name is required.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save academic profile');

      setProfile(prev => ({ ...prev, is_configured: true }));
      setMessage({ type: 'success', text: 'Faculty profile and academic configuration saved successfully!' });
      if (onProfileUpdated) onProfileUpdated();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-[#9B8A79]">
        Loading faculty profile...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner / Status */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E1E16]">
              Academic Configuration
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                profile.is_configured
                  ? 'bg-[#E4E0D5] text-[#1E1E16] border border-[#9B8A79]/40'
                  : 'bg-[#E4E0D5] text-[#1E1E16] border border-[#9B8A79]/40'
              }`}
            >
              {profile.is_configured ? '✓ Profile Configured' : 'Setup Required'}
            </span>
          </div>
          <h2 className="text-lg font-bold text-[#1E1E16] tracking-tight mt-0.5">
            Faculty Profile & Academic Settings
          </h2>
          <p className="text-xs text-[#9B8A79] mt-0.5">
            These details are printed on your official attendance registers, monthly reports, and institutional export sheets.
          </p>
        </div>

        {profile.is_configured && (
          <div className="px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-xs">
            <p className="text-[10px] text-[#9B8A79] font-semibold uppercase tracking-wider">Active Faculty</p>
            <p className="font-bold text-[#1E1E16]">{profile.faculty_name}</p>
            <p className="text-[11px] text-[#9B8A79]">{profile.department}</p>
          </div>
        )}
      </div>

      {/* Feedback Alert */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-[#E4E0D5] border-[#9B8A79]/40 text-[#1E1E16]'
              : 'bg-[#F5DDD4] border-[#1E1E16] text-[#1E1E16]'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-xs font-bold px-1.5 py-0.5 rounded-md hover:bg-black/5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Configuration Form */}
      <form onSubmit={handleSubmit} className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-6 shadow-xs space-y-6">
        {/* Section 1: Faculty Identification */}
        <div>
          <div className="flex items-center gap-2 pb-2 border-b border-[#9B8A79]/40 mb-4">
            <User className="w-4 h-4 text-[#1E1E16]" />
            <h3 className="text-sm font-bold text-[#1E1E16] uppercase tracking-wider">
              1. Faculty Identification
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#1E1E16] mb-1">
                Faculty Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Dr. A. Sharma, Prof. R. Kumar"
                value={profile.faculty_name}
                onChange={(e) => setProfile({ ...profile, faculty_name: e.target.value })}
                className="w-full text-xs px-3 py-2.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
              <p className="text-[10px] text-[#9B8A79] mt-1">
                Appears on the top header of all attendance registers and official exports.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1E1E16] mb-1">
                Department *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Information Science and Engineering (ISE)"
                value={profile.department}
                onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                className="w-full text-xs px-3 py-2.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
              <p className="text-[10px] text-[#9B8A79] mt-1">
                Department or academic division handling the course.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Academic Period & Class Details */}
        <div>
          <div className="flex items-center gap-2 pb-2 border-b border-[#9B8A79]/40 mb-4">
            <GraduationCap className="w-4 h-4 text-[#1E1E16]" />
            <h3 className="text-sm font-bold text-[#1E1E16] uppercase tracking-wider">
              2. Academic Year & Class Details
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#1E1E16] mb-1">
                Academic Year *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 2026-2027"
                value={profile.academic_year}
                onChange={(e) => setProfile({ ...profile, academic_year: e.target.value })}
                className="w-full text-xs px-3 py-2.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1E1E16] mb-1">
                Year of Study *
              </label>
              <select
                value={profile.year_of_study}
                onChange={(e) => setProfile({ ...profile, year_of_study: e.target.value })}
                className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              >
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year (Final Year)">4th Year (Final Year)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1E1E16] mb-1">
                Semester *
              </label>
              <select
                value={profile.semester}
                onChange={(e) => setProfile({ ...profile, semester: e.target.value })}
                className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                  <option key={s} value={`Semester ${s}`}>
                    Semester {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1E1E16] mb-1">
                Class / Section *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. ISE Final Year, Section A"
                value={profile.class_section}
                onChange={(e) => setProfile({ ...profile, class_section: e.target.value })}
                className="w-full text-xs px-3 py-2.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Subject & Session Specifications */}
        <div>
          <div className="flex items-center gap-2 pb-2 border-b border-[#9B8A79]/40 mb-4">
            <BookOpen className="w-4 h-4 text-[#1E1E16]" />
            <h3 className="text-sm font-bold text-[#1E1E16] uppercase tracking-wider">
              3. Course Subject & Session Hours
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1">
              <label className="block text-xs font-bold text-[#1E1E16] mb-1">
                Subject Name
              </label>
              <input
                type="text"
                placeholder="e.g. Information Security (ISE)"
                value={profile.default_subject_name || ''}
                onChange={(e) => setProfile({ ...profile, default_subject_name: e.target.value })}
                className="w-full text-xs px-3 py-2.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1E1E16] mb-1">
                Total Subject Hours
              </label>
              <input
                type="number"
                min="1"
                max="200"
                value={profile.default_total_hours || 45}
                onChange={(e) => setProfile({ ...profile, default_total_hours: parseFloat(e.target.value) || 45 })}
                className="w-full text-xs px-3 py-2.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
              <p className="text-[10px] text-[#9B8A79] mt-1">Default: 45 hours (editable)</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1E1E16] mb-1">
                Weekly Target Periods
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={profile.default_weekly_target || 3}
                onChange={(e) => setProfile({ ...profile, default_weekly_target: parseInt(e.target.value, 10) || 3 })}
                className="w-full text-xs px-3 py-2.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
              <p className="text-[10px] text-[#9B8A79] mt-1">Default: 3 periods/week</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1E1E16] mb-1">
                Period Duration (Minutes)
              </label>
              <input
                type="number"
                min="30"
                max="180"
                step="5"
                value={profile.default_period_duration || 60}
                onChange={(e) => setProfile({ ...profile, default_period_duration: parseInt(e.target.value, 10) || 60 })}
                className="w-full text-xs px-3 py-2.5 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
              />
              <p className="text-[10px] text-[#9B8A79] mt-1">Standard: 60 mins per session</p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-[#9B8A79]/40 flex items-center justify-between">
          <p className="text-xs text-[#9B8A79]">
            Changes will automatically update your active class and all linked attendance session calculations.
          </p>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <RotateCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Save Academic Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};
