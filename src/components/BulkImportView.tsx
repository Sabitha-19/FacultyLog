import React, { useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Info
} from 'lucide-react';
import { Student } from '../types';
import { apiFetch } from '../authClient';

interface BulkImportViewProps {
  students: Student[];
  activeDataset: string;
  onRefresh: () => void;
}

export const BulkImportView: React.FC<BulkImportViewProps> = ({ students, activeDataset, onRefresh }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inputText, setInputText] = useState('');
  const [parsedData, setParsedData] = useState<Record<string, Record<string, string>>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Template generator using actual uploaded student roll numbers only
  const handleLoadSample = () => {
    if (students.length === 0) {
      setValidationErrors(['No student records found in this class. Please import your student list first.']);
      return;
    }
    setValidationErrors([]);
    const today = new Date().toISOString().split('T')[0];
    const classRolls = students.slice(0, 5).map(s => s.roll_no || s.reg_no);
    const template = `Date,${classRolls.join(',')}\n${today},${classRolls.map(() => 'P').join(',')}`;
    setInputText(template);
  };

  // Step 1 -> 2: Parse and Validate
  const handleParse = () => {
    setValidationErrors([]);
    setSuccessMessage('');
    if (!inputText.trim()) {
      setValidationErrors(['Please paste CSV data or attendance matrix.']);
      return;
    }

    try {
      const lines = inputText.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        setValidationErrors(['Matrix requires at least a header row of roll numbers and one date row.']);
        return;
      }

      // First line: Date, Roll1, Roll2...
      const header = lines[0].split(/[,\t]+/).map(h => h.trim().replace(/^["']|["']$/g, ''));
      const rollNumbers = header.slice(1);

      const activeRollMap = new Set(students.map(s => {
        const roll = String(s.roll_no || s.reg_no || '');
        const k = roll.endsWith('.0') ? roll.slice(0, -2) : roll;
        return k.toLowerCase();
      }));

      const errors: string[] = [];
      const matrix: Record<string, Record<string, string>> = {};
      const today = new Date().toISOString().split('T')[0];

      // Validate header rolls
      for (const r of rollNumbers) {
        const k = (r.endsWith('.0') ? r.slice(0, -2) : r).toLowerCase();
        if (!activeRollMap.has(k)) {
          errors.push(`Header contains unrecognized Roll Number: "${r}".`);
        }
      }

      // Parse each date row
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(/[,\t]+/).map(c => c.trim().replace(/^["']|["']$/g, ''));
        const dateStr = row[0];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          errors.push(`Row ${i + 1}: Invalid date format "${dateStr}". Use YYYY-MM-DD.`);
          continue;
        }
        if (dateStr > today) {
          errors.push(`Row ${i + 1}: Date "${dateStr}" is in the future.`);
        }

        const dateAttendance: Record<string, string> = {};
        for (let j = 0; j < rollNumbers.length; j++) {
          const roll = rollNumbers[j];
          const val = (row[j + 1] || 'P').trim().toUpperCase();
          if (val !== 'P' && val !== 'A' && val !== 'OD') {
            errors.push(`Row ${i + 1} (${dateStr}, Roll ${roll}): Status must be P, A, or OD (got "${val}").`);
          }
          dateAttendance[roll] = val;
        }
        matrix[dateStr] = dateAttendance;
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
        return;
      }

      setParsedData(matrix);
      setStep(2);
    } catch (err: any) {
      setValidationErrors([err.message || 'Failed to parse text.']);
    }
  };

  // Step 2 -> 3: Confirm and Execute API Call
  const handleConfirmImport = async () => {
    setIsSubmitting(true);
    setValidationErrors([]);
    try {
      const res = await apiFetch('/api/attendance/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendance: parsedData,
          replace_existing: replaceExisting
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      setSuccessMessage(`Successfully imported attendance across ${data.count} date(s)!`);
      setStep(3);
      onRefresh();
    } catch (err: any) {
      setValidationErrors([err.message || 'Import execution failed.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step Navigator Header */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E1E16]">
              Batch Attendance Data
            </span>
            <h2 className="text-lg font-bold text-[#1E1E16] tracking-tight">
              Bulk Attendance Excel & CSV Importer
            </h2>
          </div>
          <span className="text-xs text-[#9B8A79] font-semibold font-mono-numbers">
            Dataset: {activeDataset} ({students.length} students)
          </span>
        </div>

        {/* 3 Steps indicator */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className={`p-2.5 rounded-lg border text-center font-bold ${
            step === 1
              ? 'bg-[#A7674D] text-[#F1F0EB] border-[#1E1E16]'
              : 'bg-white text-[#1E1E16] border-[#9B8A79]/40'
          }`}>
            1. Upload & Paste Matrix
          </div>
          <div className={`p-2.5 rounded-lg border text-center font-bold ${
            step === 2
              ? 'bg-[#A7674D] text-[#F1F0EB] border-[#1E1E16]'
              : 'bg-white text-[#1E1E16] border-[#9B8A79]/40'
          }`}>
            2. Validate & Preview
          </div>
          <div className={`p-2.5 rounded-lg border text-center font-bold ${
            step === 3
              ? 'bg-[#A7674D] text-[#F1F0EB] border-[#1E1E16]'
              : 'bg-white text-[#1E1E16] border-[#9B8A79]/40'
          }`}>
            3. Import Complete
          </div>
        </div>
      </div>

      {/* Validation Errors Alert */}
      {validationErrors.length > 0 && (
        <div className="p-4 bg-[#F5DDD4] border border-[#1E1E16] rounded-xl text-xs text-[#1E1E16] space-y-1">
          <div className="flex items-center gap-2 font-bold mb-1">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Import Validation Issues ({validationErrors.length})</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* STEP 1: Upload / Input */}
      {step === 1 && (
        <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#1E1E16] uppercase tracking-wider">
              Paste CSV / Matrix Data
            </h3>
            <button
              onClick={handleLoadSample}
              className="text-xs text-[#1E1E16] font-semibold hover:underline cursor-pointer"
            >
              Fill Header from Uploaded Students
            </button>
          </div>

          <div className="p-3 bg-white border border-[#9B8A79]/40 rounded-lg text-xs text-[#9B8A79] space-y-1">
            <p className="font-semibold text-[#1E1E16]">Format Specification:</p>
            <p className="font-mono text-[11px] text-[#9B8A79]">
              Date, Roll1, Roll2, Roll3...<br />
              2026-10-01, P, A, P...<br />
              2026-10-02, P, P, P...
            </p>
          </div>

          <textarea
            rows={10}
            placeholder="Paste your CSV matrix here with header row..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full text-xs font-mono p-3 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
          />

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-xs text-[#1E1E16] cursor-pointer">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="w-4 h-4 text-[#1E1E16] rounded border-[#9B8A79]/40"
              />
              <span>Replace existing attendance if dates collide</span>
            </label>

            <button
              onClick={handleParse}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-xs cursor-pointer"
            >
              <span>Validate Matrix</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Preview Matrix */}
      {step === 2 && (
        <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-[#1E1E16] uppercase tracking-wider">
                Preview Parsed Attendance Records
              </h3>
              <p className="text-[11px] text-[#9B8A79] mt-0.5">
                Found {Object.keys(parsedData).length} date(s) ready for atomic database write.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep(1)}
                className="px-3.5 py-2 text-xs font-semibold text-[#1E1E16] bg-white border border-[#9B8A79]/40 rounded-lg hover:bg-[#F1F0EB]/20 cursor-pointer"
              >
                Back to Edit
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Confirm & Import Database</span>
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-auto border border-[#9B8A79]/40 rounded-lg bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F1F0EB]/40 border-b border-[#9B8A79]/40 text-[#1E1E16] text-[11px] font-bold sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Total Marked</th>
                  <th className="py-2.5 px-3">Present</th>
                  <th className="py-2.5 px-3">Absent</th>
                  <th className="py-2.5 px-3">Absent Roll Numbers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9B8A79]/15 font-mono-numbers">
                {Object.entries(parsedData).map(([dateStr, record]) => {
                  const vals = Object.values(record);
                  const pCount = vals.filter(v => v === 'P').length;
                  const absents = Object.entries(record).filter(([_, v]) => v === 'A').map(([r]) => r);
                  return (
                    <tr key={dateStr} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-bold text-[#1E1E16]">{dateStr}</td>
                      <td className="py-2.5 px-3 text-[#9B8A79]">{vals.length}</td>
                      <td className="py-2.5 px-3 text-[#1E1E16] font-bold">{pCount}</td>
                      <td className="py-2.5 px-3 text-[#1E1E16] font-bold">{absents.length}</td>
                      <td className="py-2.5 px-3 text-[11px] text-[#1E1E16] truncate max-w-xs">
                        {absents.join(', ') || 'None (All Present)'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 3: Success Screen */}
      {step === 3 && (
        <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-8 shadow-xs text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#E4E0D5] text-[#1E1E16] flex items-center justify-center mx-auto border border-[#9B8A79]/40">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#1E1E16]">
            Bulk Import Completed!
          </h3>
          <p className="text-xs text-[#9B8A79] max-w-md mx-auto">
            {successMessage || 'All attendance records have been successfully inserted into the SQLite database.'}
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                setInputText('');
                setStep(1);
              }}
              className="px-4 py-2 text-xs font-semibold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] rounded-lg transition-colors cursor-pointer"
            >
              Import More Records
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
