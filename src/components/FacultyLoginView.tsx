import React, { useState } from 'react';
import {
  GraduationCap,
  Lock,
  Mail,
  User,
  Building2,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { FacultyAuthUser } from '../types';
import { apiFetch, setStoredAuthToken } from '../authClient';

interface FacultyLoginViewProps {
  onAuthenticated: (user: FacultyAuthUser) => void;
}

export const FacultyLoginView: React.FC<FacultyLoginViewProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [facultyName, setFacultyName] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setErrorMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage('Please enter your registered faculty email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    if (mode === 'register') {
      if (!facultyName.trim()) {
        setErrorMessage('Please enter your full faculty name.');
        return;
      }
      if (!department.trim()) {
        setErrorMessage('Please enter your academic department.');
        return;
      }
      if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please verify both password fields.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email: cleanEmail, password }
          : {
              faculty_name: facultyName.trim(),
              department: department.trim(),
              email: cleanEmail,
              password
            };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Please check your credentials.');
      }

      if (data.token) {
        setStoredAuthToken(data.token);
      }

      onAuthenticated(data.user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to authenticate. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[#F1F0EB] text-[#1E1E16] font-body flex flex-col lg:flex-row">
      {/* Left Institutional Panel */}
      <div className="lg:w-5/12 bg-[#1E1E16] text-[#F1F0EB] p-8 lg:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#9B8A79]/30">
        <div>
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#A7674D] flex items-center justify-center text-[#F1F0EB] shadow-sm">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-medium tracking-tight text-[#F1F0EB] leading-none">
                FacultyLog
              </h1>
              <p className="text-xs text-[#9B8A79] mt-1">
                Smart Attendance. Simplified Academics.
              </p>
            </div>
          </div>

          <div className="mt-12 space-y-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#6C6B50]/40 border border-[#9B8A79]/30 text-[11px] font-semibold uppercase tracking-wider text-[#F1F0EB]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#A7674D]" />
              Authenticated Faculty Portal
            </span>

            <h2 className="text-3xl lg:text-4xl font-heading font-medium leading-tight text-[#F1F0EB]">
              Dedicated Class Registers &amp; Isolated Student Records
            </h2>

            <p className="text-sm text-[#9B8A79] leading-relaxed max-w-md">
              Sign in with your faculty credentials to manage your uploaded student rosters, mark period-wise attendance, track semester hours, and download official Microsoft Excel attendance registers.
            </p>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[#9B8A79]/25 space-y-3 text-xs text-[#9B8A79]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#E4E0D5]/5 border border-[#9B8A79]/20">
              <p className="font-semibold text-[#F1F0EB]">Faculty-Wise Isolation</p>
              <p className="text-[11px] text-[#9B8A79] mt-0.5">
                Every class roster, session, and Excel export belongs strictly to your account.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#E4E0D5]/5 border border-[#9B8A79]/20">
              <p className="font-semibold text-[#F1F0EB]">Official Excel Registers</p>
              <p className="text-[11px] text-[#9B8A79] mt-0.5">
                Monthly &amp; Complete Semester .xlsx exports with P, A, OD, and Holiday formatting.
              </p>
            </div>
          </div>
          <p className="text-[11px] text-[#9B8A79]/80">
            FacultyLog Academic Attendance System • Secure Session &amp; Cryptographic Password Protection
          </p>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-2xl shadow-lg p-7 sm:p-8">
          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#E4E0D5] border border-[#9B8A79]/30 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-[#A7674D] text-[#F1F0EB] shadow-xs'
                  : 'text-[#1E1E16] hover:bg-[#F1F0EB]/60'
              }`}
            >
              Faculty Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-[#A7674D] text-[#F1F0EB] shadow-xs'
                  : 'text-[#1E1E16] hover:bg-[#F1F0EB]/60'
              }`}
            >
              Register Account
            </button>
          </div>

          <div className="mb-5">
            <h3 className="text-xl font-heading font-medium text-[#1E1E16]">
              {mode === 'login' ? 'Welcome Back, Faculty' : 'Create Faculty Account'}
            </h3>
            <p className="text-xs text-[#9B8A79] mt-1">
              {mode === 'login'
                ? 'Enter your registered email and password to access your dashboard.'
                : 'Register your faculty credentials. Your account starts with a clean, empty student list ready for upload.'}
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3 bg-[#F5DDD4] border border-[#A7674D] rounded-xl text-xs text-[#1E1E16] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#A7674D] shrink-0 mt-0.5" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1.5">
                    Faculty Full Name *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#9B8A79] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={facultyName}
                      onChange={(e) => setFacultyName(e.target.value)}
                      placeholder="Enter your full name"
                      autoComplete="name"
                      className="w-full pl-9 pr-3 py-2.5 text-xs bg-[#F1F0EB]/60 border border-[#9B8A79]/40 rounded-xl text-[#1E1E16] placeholder:text-[#9B8A79] focus:outline-none focus:border-[#A7674D] focus:bg-white transition-colors"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1E1E16] mb-1.5">
                    Department *
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-[#9B8A79] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="Enter your department (e.g. CSE, ISE, ECE)"
                      autoComplete="organization"
                      className="w-full pl-9 pr-3 py-2.5 text-xs bg-[#F1F0EB]/60 border border-[#9B8A79]/40 rounded-xl text-[#1E1E16] placeholder:text-[#9B8A79] focus:outline-none focus:border-[#A7674D] focus:bg-white transition-colors"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#1E1E16] mb-1.5">
                Faculty Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#9B8A79] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your institutional email"
                  autoComplete="email"
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-[#F1F0EB]/60 border border-[#9B8A79]/40 rounded-xl text-[#1E1E16] placeholder:text-[#9B8A79] focus:outline-none focus:border-[#A7674D] focus:bg-white transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E1E16] mb-1.5">
                Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#9B8A79] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Minimum 6 characters' : 'Enter your password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full pl-9 pr-9 py-2.5 text-xs bg-[#F1F0EB]/60 border border-[#9B8A79]/40 rounded-xl text-[#1E1E16] placeholder:text-[#9B8A79] focus:outline-none focus:border-[#A7674D] focus:bg-white transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9B8A79] hover:text-[#1E1E16] p-1 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1.5">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#9B8A79] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-[#F1F0EB]/60 border border-[#9B8A79]/40 rounded-xl text-[#1E1E16] placeholder:text-[#9B8A79] focus:outline-none focus:border-[#A7674D] focus:bg-white transition-colors"
                    required
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{mode === 'login' ? 'Signing In...' : 'Creating Account...'}</span>
                </>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In to FacultyLog' : 'Register & Open Dashboard'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-[#9B8A79]/25 text-center text-xs text-[#9B8A79]">
            {mode === 'login' ? (
              <span>
                New faculty member?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-semibold text-[#A7674D] hover:underline cursor-pointer"
                >
                  Register your faculty account
                </button>
              </span>
            ) : (
              <span>
                Already have a registered account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-semibold text-[#A7674D] hover:underline cursor-pointer"
                >
                  Sign in here
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
