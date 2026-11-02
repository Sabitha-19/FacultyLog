import React, { useState, useRef } from 'react';
import {
  UserPlus,
  Search,
  Upload,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  X,
  AlertCircle,
  Download,
  FileText,
  ArrowRight,
  Check,
  RefreshCw,
  Users
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student } from '../types';
import { apiFetch, downloadAuthenticatedFile } from '../authClient';

interface StudentsViewProps {
  students: Student[];
  onRefresh: () => void;
  onAddStudent: (regNo: string, rollNo: string, name: string) => Promise<void>;
  onUpdateStudent: (id: number, regNo: string, rollNo: string, name: string, isActive: boolean) => Promise<void>;
  onDeleteStudent: (id: number) => Promise<void>;
  onImportStudents: (rows: any[]) => Promise<{ imported: number; errors: string[] }>;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  onRefresh,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onImportStudents,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // 5-Step Import Modal states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [importText, setImportText] = useState('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [validationResults, setValidationResults] = useState<{
    total: number;
    validCount: number;
    duplicateCount: number;
    invalidCount: number;
    rows: {
      sNo: number | string;
      rollNo?: string;
      regNo: string;
      name: string;
      status: 'valid' | 'duplicate' | 'invalid';
      error?: string;
    }[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [workbookRef, setWorkbookRef] = useState<XLSX.WorkBook | null>(null);

  // Add/Edit Form states
  const [regNo, setRegNo] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter students
  const filteredStudents = students.filter(s => {
    const term = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      (s.roll_no && s.roll_no.toLowerCase().includes(term)) ||
      s.reg_no.toLowerCase().includes(term)
    );
  });

  const [listError, setListError] = useState('');

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNo.trim() || !name.trim()) {
      setFormError('Register Number and Student Name are required.');
      return;
    }
    setFormError('');
    setIsSubmitting(true);
    try {
      await onAddStudent(regNo.trim(), rollNo.trim(), name.trim());
      setRegNo('');
      setRollNo('');
      setName('');
      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to add student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    if (!regNo.trim() || !name.trim()) {
      setFormError('Register Number and Student Name are required.');
      return;
    }
    setFormError('');
    setIsSubmitting(true);
    try {
      await onUpdateStudent(editingStudent.id, regNo.trim(), rollNo.trim(), name.trim(), isActive);
      setEditingStudent(null);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (s: Student) => {
    setEditingStudent(s);
    setRegNo(s.reg_no);
    setRollNo(s.roll_no || '');
    setName(s.name);
    setIsActive(!!s.is_active);
    setFormError('');
  };

  const handleDelete = async (id: number) => {
    setListError('');
    try {
      await onDeleteStudent(id);
      onRefresh();
    } catch (err: any) {
      setListError(err.message || 'Failed to delete student.');
    }
  };

  // ==========================================
  // 5-STEP IMPORT WORKFLOW
  // Step 1: Upload (file or text)
  // Step 2: Validate via /api/students/validate
  // Step 3: Preview with status table
  // Step 4: Confirm
  // Step 5: Save & Commit
  // ==========================================
  const processExcelSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    try {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) {
        setFormError(`Sheet "${sheetName}" not found.`);
        return;
      }
      // Read 2D array of formatted cells to preserve strings and leading zeros
      const raw2D = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '' });
      if (!raw2D || raw2D.length === 0) {
        setFormError(`Worksheet "${sheetName}" is empty.`);
        return;
      }

      // Smart header scanning across the first 15 rows
      let headerIdx = -1;
      let headerKeys: string[] = [];

      for (let r = 0; r < Math.min(15, raw2D.length); r++) {
        const row = raw2D[r];
        if (!Array.isArray(row)) continue;
        const matches = row.filter((c: any) => {
          const s = String(c ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return ['sno', 'slno', 'serial', 'reg', 'register', 'roll', 'name', 'student', 'usn', 'admno'].some(kw => s.includes(kw));
        });
        if (matches.length >= 2) {
          headerIdx = r;
          headerKeys = row.map((c: any) => String(c ?? '').trim());
          break;
        }
      }

      const rows: any[] = [];
      if (headerIdx !== -1) {
        // Headers identified; parse subsequent data rows
        for (let r = headerIdx + 1; r < raw2D.length; r++) {
          const rowData = raw2D[r];
          if (!rowData || !Array.isArray(rowData)) continue;
          if (rowData.every(c => String(c ?? '').trim() === '')) continue;
          const obj: Record<string, any> = {};
          for (let c = 0; c < headerKeys.length; c++) {
            const h = headerKeys[c] || `col_${c}`;
            obj[h] = String(rowData[c] ?? '').trim();
          }
          rows.push(obj);
        }
      } else {
        // Direct data rows without header line
        for (let r = 0; r < raw2D.length; r++) {
          const rowData = raw2D[r];
          if (!rowData || !Array.isArray(rowData)) continue;
          if (rowData.every(c => String(c ?? '').trim() === '')) continue;
          if (rowData.length >= 4) {
            rows.push({
              'S.No': String(rowData[0] ?? (r + 1)).trim(),
              'Roll Number': String(rowData[1] ?? '').trim(),
              'Register Number': String(rowData[2] ?? '').trim(),
              'Student Name': String(rowData.slice(3).join(' ') ?? '').trim()
            });
          } else if (rowData.length === 3) {
            rows.push({
              'S.No': String(rowData[0] ?? (r + 1)).trim(),
              'Register Number': String(rowData[1] ?? '').trim(),
              'Student Name': String(rowData[2] ?? '').trim()
            });
          } else if (rowData.length === 2) {
            rows.push({
              'S.No': r + 1,
              'Register Number': String(rowData[0] ?? '').trim(),
              'Student Name': String(rowData[1] ?? '').trim()
            });
          }
        }
      }

      parseAndValidateRows(rows);
    } catch (err: any) {
      setFormError('Failed to parse Excel sheet: ' + err.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isXlsx) {
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', raw: false });
          setWorkbookRef(workbook);
          setSheetNames(workbook.SheetNames);
          const firstSheet = workbook.SheetNames[0] || 'Sheet1';
          setSelectedSheet(firstSheet);
          processExcelSheet(workbook, firstSheet);
        } catch (err: any) {
          setFormError('Failed to parse Excel file: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result as string;
          parseCsvText(text);
        } catch (err: any) {
          setFormError('Failed to parse CSV file: ' + err.message);
        }
      };
      reader.readAsText(file);
    }
  };

  const parseCsvText = (text: string) => {
    const rawLines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) {
      setFormError('Uploaded file or text is empty.');
      return;
    }

    // CSV line parser handling comma and quotes
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' || c === "'") {
          inQuotes = !inQuotes;
        } else if ((c === ',' || c === '\t') && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      result.push(cur.trim());
      return result;
    };

    let startIdx = 0;
    let headerKeys: string[] = [];
    const firstLineCells = parseLine(rawLines[0]);
    const matchesHeader = firstLineCells.some(c => {
      const s = c.toLowerCase().replace(/[^a-z0-9]/g, '');
      return ['sno', 'slno', 'serial', 'reg', 'register', 'roll', 'name', 'student'].some(k => s.includes(k));
    });

    if (matchesHeader) {
      startIdx = 1;
      headerKeys = firstLineCells;
    }

    const rows: any[] = [];
    for (let i = startIdx; i < rawLines.length; i++) {
      const cols = parseLine(rawLines[i]);
      if (cols.length === 0 || cols.every(c => c === '')) continue;
      if (headerKeys.length > 0) {
        const obj: Record<string, any> = {};
        for (let c = 0; c < headerKeys.length; c++) {
          obj[headerKeys[c]] = cols[c] || '';
        }
        rows.push(obj);
      } else {
        if (cols.length >= 4) {
          rows.push({
            'S.No': cols[0],
            'Roll Number': cols[1],
            'Register Number': cols[2],
            'Student Name': cols.slice(3).join(' ')
          });
        } else if (cols.length === 3) {
          rows.push({
            'S.No': cols[0],
            'Register Number': cols[1],
            'Student Name': cols[2]
          });
        } else if (cols.length >= 2) {
          rows.push({
            'S.No': i + 1,
            'Register Number': cols[0],
            'Student Name': cols.slice(1).join(' ')
          });
        }
      }
    }

    parseAndValidateRows(rows);
  };

  const parseAndValidateRows = async (rawRows: any[]) => {
    if (!rawRows || rawRows.length === 0) {
      setFormError('No data rows found. Ensure file matches template: S.No, Register Number, Student Name.');
      return;
    }

    setImporting(true);
    setFormError('');
    try {
      const res = await apiFetch('/api/students/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rawRows })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Validation failed');

      setParsedRows(rawRows);
      setValidationResults(data);
      setImportStep(3); // Navigate to Preview step
    } catch (err: any) {
      setFormError(err.message || 'Validation request failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleCommitImport = async () => {
    if (!validationResults || validationResults.validCount === 0) {
      setFormError('No valid student rows to import.');
      return;
    }

    setImporting(true);
    setFormError('');
    try {
      // Filter only valid rows while keeping S.No, Roll Number, and Register Number strictly separate
      const validRowsToSave = validationResults.rows
        .filter(r => r.status === 'valid')
        .map(r => ({
          sNo: r.sNo,
          rollNo: r.rollNo ?? '',
          regNo: r.regNo,
          name: r.name
        }));

      const res = await onImportStudents(validRowsToSave);
      setImportSuccess(res.imported);
      setImportStep(5); // Saved state
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Import commit failed.');
    } finally {
      setImporting(false);
    }
  };

  const resetImportModal = () => {
    setImportStep(1);
    setImportText('');
    setParsedRows([]);
    setValidationResults(null);
    setImportSuccess(null);
    setSheetNames([]);
    setSelectedSheet('');
    setWorkbookRef(null);
    setFormError('');
    setShowImportModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar with Template Downloads */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Search Field */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#9B8A79] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search student name, roll number, or register number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] placeholder:text-[#9B8A79] focus:outline-none focus:border-[#1E1E16]"
          />
        </div>

        {/* Action Buttons & Template Downloads */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Template Downloads */}
          <button
            type="button"
            onClick={() => downloadAuthenticatedFile('/api/templates/students.csv', 'students_template.csv')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#1E1E16] bg-white border border-[#9B8A79]/40 hover:bg-[#F1F0EB]/20 transition-all cursor-pointer"
            title="Download blank CSV template"
          >
            <Download className="w-3.5 h-3.5 text-[#1E1E16]" />
            <span>Blank CSV Template</span>
          </button>

          <button
            type="button"
            onClick={() => downloadAuthenticatedFile('/api/templates/students.xlsx', 'students_template.xlsx')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#1E1E16] bg-white border border-[#9B8A79]/40 hover:bg-[#F1F0EB]/20 transition-all cursor-pointer"
            title="Download blank Excel template"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#1E1E16]" />
            <span>Blank Excel Template</span>
          </button>

          {/* 5-Step Import Workflow Trigger */}
          <button
            onClick={() => {
              setImportStep(1);
              setFormError('');
              setShowImportModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-xs cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>5-Step Import</span>
          </button>

          {/* Add Student */}
          <button
            onClick={() => {
              setRegNo('');
              setRollNo('');
              setName('');
              setFormError('');
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-[#1E1E16] bg-white border border-[#1E1E16]/30 hover:bg-[#1E1E16]/5 transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#1E1E16]" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {listError && (
        <div className="p-3 bg-[#F5DDD4] border border-[#1E1E16] text-[#1E1E16] text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{listError}</span>
          </div>
          <button onClick={() => setListError('')} className="font-bold px-1.5">✕</button>
        </div>
      )}

      {/* Students Data Table or Clean Empty State */}
      <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl shadow-xs overflow-hidden">
        {students.length === 0 ? (
          /* Clean Empty State */
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-[#F1F0EB]/40 border border-[#9B8A79]/40 flex items-center justify-center text-[#1E1E16] mb-3">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[#1E1E16]">
              No student records found. Please upload your student Excel or CSV file.
            </h3>
            <p className="text-xs text-[#9B8A79] mt-1 max-w-md">
              Download the blank student template (S.No, Roll Number, Register Number, Student Name) or upload your existing class Excel/CSV spreadsheet.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
              <button
                type="button"
                onClick={() => downloadAuthenticatedFile('/api/templates/students.csv', 'students_template.csv')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-[#1E1E16] bg-white border border-[#9B8A79]/40 hover:bg-[#F1F0EB]/20 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#1E1E16]" />
                <span>Download Blank CSV Template</span>
              </button>

              <button
                onClick={() => {
                  setImportStep(1);
                  setFormError('');
                  setShowImportModal(true);
                }}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] transition-all shadow-md cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Import Students</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#F1F0EB]/50 border-b border-[#9B8A79]/40 text-[#1E1E16] font-bold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 w-14 text-center">S.No</th>
                  <th className="py-3 px-4 w-32">Roll Number</th>
                  <th className="py-3 px-4 w-44">Register Number</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4 text-center w-28">Overall %</th>
                  <th className="py-3 px-4 text-center w-24">Status</th>
                  <th className="py-3 px-4 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9B8A79]/20">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-white/70 transition-colors">
                      <td className="py-3 px-4 text-center text-[#9B8A79] font-mono-numbers">
                        {s.sNo ?? idx + 1}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#1E1E16] font-mono-numbers">
                        {s.roll_no || '—'}
                      </td>
                      <td className="py-3 px-4 text-[#1E1E16] font-mono font-medium">
                        {s.reg_no}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#1E1E16]">
                        {s.name}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-md font-bold font-mono-numbers text-[11px] ${
                          (s.attendancePct || 0) >= 75
                            ? 'bg-[#E4E0D5] text-[#1E1E16] border border-[#9B8A79]/40'
                            : 'bg-[#F5DDD4] text-[#1E1E16] border border-[#1E1E16]'
                        }`}>
                          {s.attendancePct ?? 0}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          s.is_active
                            ? 'bg-[#E4E0D5] text-[#1E1E16]'
                            : 'bg-[#6C6B50] text-[#F1F0EB]/20 text-[#9B8A79]'
                        }`}>
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => startEdit(s)}
                            title="Edit Student"
                            className="p-1 text-[#9B8A79] hover:text-[#1E1E16] hover:bg-[#F1F0EB]/30 rounded-md transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            title="Delete Student"
                            className="p-1 text-[#9B8A79] hover:text-[#1E1E16] hover:bg-[#F5DDD4] rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#9B8A79]">
                      No students match your query. Add a student or clear the search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5-STEP STUDENT IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-[#1E1E16]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl shadow-2xl max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#1E1E16] flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#1E1E16]" />
                  5-Step Student Import Workflow
                </h3>
                <p className="text-[11px] text-[#9B8A79] mt-0.5">
                  Step {importStep} of 5 — {
                    importStep === 1 ? 'Upload File / Paste' :
                    importStep === 2 ? 'Validating Records...' :
                    importStep === 3 ? 'Preview & Deduplication Check' :
                    importStep === 4 ? 'Confirm Import' :
                    'Complete!'
                  }
                </p>
              </div>
              <button onClick={resetImportModal} className="text-[#9B8A79] hover:text-[#1E1E16] p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step Indicators */}
            <div className="flex items-center justify-between gap-1 my-4 border-b border-[#9B8A79]/40 pb-3 text-[11px]">
              {[
                { step: 1, label: 'Upload' },
                { step: 2, label: 'Validate' },
                { step: 3, label: 'Preview' },
                { step: 4, label: 'Confirm' },
                { step: 5, label: 'Save' }
              ].map(s => (
                <div key={s.step} className="flex items-center gap-1.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                    importStep === s.step
                      ? 'bg-[#A7674D] text-[#F1F0EB]'
                      : importStep > s.step
                      ? 'bg-[#A7674D] text-[#F1F0EB]'
                      : 'bg-[#F1F0EB]/50 text-[#9B8A79]'
                  }`}>
                    {importStep > s.step ? '✓' : s.step}
                  </span>
                  <span className={`font-semibold ${importStep === s.step ? 'text-[#1E1E16]' : 'text-[#9B8A79]'}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {formError && (
              <div className="mb-4 p-2.5 bg-[#F5DDD4] border border-[#1E1E16] text-[#1E1E16] text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* STEP 1: Upload / Input */}
            {importStep === 1 && (
              <div className="space-y-4 text-xs">
                {/* Upload drag/drop box */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#9B8A79]/40 hover:border-[#1E1E16] rounded-xl p-6 text-center cursor-pointer transition-colors bg-white/60 hover:bg-white"
                >
                  <FileSpreadsheet className="w-8 h-8 text-[#1E1E16] mx-auto mb-2 opacity-80" />
                  <p className="font-bold text-[#1E1E16]">
                    Click to select CSV or Excel (.xlsx) file
                  </p>
                  <p className="text-[11px] text-[#9B8A79] mt-1">
                    Supports <strong>S.No, Roll Number, Register Number, Student Name</strong> (or 3-column S.No, Register Number, Student Name)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {/* Multi-Sheet Selection */}
                {sheetNames.length > 1 && (
                  <div className="flex items-center justify-between p-3 bg-white border border-[#9B8A79]/40 rounded-lg">
                    <span className="text-[11px] font-bold text-[#1E1E16]">
                      Select Excel Worksheet:
                    </span>
                    <select
                      value={selectedSheet}
                      onChange={(e) => {
                        const newSheet = e.target.value;
                        setSelectedSheet(newSheet);
                        if (workbookRef) {
                          processExcelSheet(workbookRef, newSheet);
                        }
                      }}
                      className="text-xs font-semibold px-2.5 py-1.5 bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-md text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                    >
                      {sheetNames.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="relative text-center my-2">
                  <span className="bg-[#FFFFFF] px-2 text-[10px] text-[#9B8A79] font-semibold uppercase">
                    or paste data directly
                  </span>
                  <div className="absolute inset-0 -z-10 flex items-center">
                    <div className="w-full border-t border-[#9B8A79]/40" />
                  </div>
                </div>

                <textarea
                  rows={4}
                  placeholder={`S.No, Roll Number, Register Number, Student Name`}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full text-xs font-mono p-3 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadAuthenticatedFile('/api/templates/students.csv', 'students_template.csv')}
                      className="text-[11px] text-[#1E1E16] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Blank CSV</span>
                    </button>
                    <span className="text-[#9B8A79]">•</span>
                    <button
                      type="button"
                      onClick={() => downloadAuthenticatedFile('/api/templates/students.xlsx', 'students_template.xlsx')}
                      className="text-[11px] text-[#1E1E16] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Blank Excel</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => parseCsvText(importText)}
                    disabled={!importText.trim() || importing}
                    className="px-5 py-2 text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {importing ? 'Validating...' : 'Proceed to Validation'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Preview & Validation Table */}
            {importStep === 3 && validationResults && (
              <div className="space-y-4 text-xs">
                {/* Summary Badges */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-white border border-[#9B8A79]/40 rounded-lg">
                    <span className="text-[10px] text-[#9B8A79] font-semibold uppercase">Total Rows</span>
                    <p className="text-base font-extrabold text-[#1E1E16] font-mono-numbers">{validationResults.total}</p>
                  </div>
                  <div className="p-2 bg-[#E4E0D5] border border-[#9B8A79]/40 text-[#1E1E16] rounded-lg">
                    <span className="text-[10px] font-semibold uppercase">Valid New</span>
                    <p className="text-base font-extrabold font-mono-numbers">{validationResults.validCount}</p>
                  </div>
                  <div className="p-2 bg-[#E4E0D5] border border-[#9B8A79]/40 text-[#1E1E16] rounded-lg">
                    <span className="text-[10px] font-semibold uppercase">Duplicate</span>
                    <p className="text-base font-extrabold font-mono-numbers">{validationResults.duplicateCount}</p>
                  </div>
                  <div className="p-2 bg-[#F5DDD4] border border-[#1E1E16] text-[#1E1E16] rounded-lg">
                    <span className="text-[10px] font-semibold uppercase">Invalid</span>
                    <p className="text-base font-extrabold font-mono-numbers">{validationResults.invalidCount}</p>
                  </div>
                </div>

                {/* Rows Table */}
                <div className="max-h-60 overflow-y-auto border border-[#9B8A79]/40 rounded-lg bg-white">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-[#F1F0EB]/40 sticky top-0 border-b border-[#9B8A79]/40 text-[#1E1E16] font-bold">
                      <tr>
                        <th className="py-2 px-3 w-12">S.No</th>
                        <th className="py-2 px-3 w-24">Roll No</th>
                        <th className="py-2 px-3 w-32">Register No</th>
                        <th className="py-2 px-3">Student Name</th>
                        <th className="py-2 px-3 text-right">Validation Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#9B8A79]/20">
                      {validationResults.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-black/5">
                          <td className="py-2 px-3 text-[#9B8A79] font-mono-numbers">{r.sNo || i + 1}</td>
                          <td className="py-2 px-3 font-mono font-bold text-[#1E1E16]">{r.rollNo || r.sNo || i + 1}</td>
                          <td className="py-2 px-3 font-mono font-medium text-[#1E1E16]">{r.regNo}</td>
                          <td className="py-2 px-3 font-semibold text-[#1E1E16]">{r.name}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.status === 'valid'
                                ? 'bg-[#E4E0D5] text-[#1E1E16]'
                                : r.status === 'duplicate'
                                ? 'bg-[#F5DDD4] text-[#1E1E16]'
                                : 'bg-[#F5DDD4] text-[#1E1E16]'
                            }`}>
                              {r.status === 'valid' ? '✓ Ready to Add' : r.error || r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#9B8A79]/40">
                  <button
                    type="button"
                    onClick={() => setImportStep(1)}
                    className="px-4 py-2 text-xs font-semibold text-[#1E1E16] hover:bg-[#F1F0EB]/30 rounded-lg cursor-pointer"
                  >
                    Back to Upload
                  </button>

                  <button
                    type="button"
                    disabled={validationResults.validCount === 0 || importing}
                    onClick={() => setImportStep(4)}
                    className="px-5 py-2 text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Proceed to Confirm ({validationResults.validCount} Valid)
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Confirmation */}
            {importStep === 4 && validationResults && (
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-white border border-[#9B8A79]/40 rounded-xl space-y-2 text-[#1E1E16]">
                  <h4 className="font-bold text-sm">Ready to commit student records?</h4>
                  <p className="text-[#9B8A79]">
                    You are about to insert <strong>{validationResults.validCount} student(s)</strong> into the active database.
                    {validationResults.duplicateCount > 0 && ` ${validationResults.duplicateCount} duplicate row(s) will be automatically skipped.`}
                  </p>
                  <p className="text-[11px] text-[#9B8A79]">
                    Register numbers will be saved in exact text format preserving all leading zeros.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#9B8A79]/40">
                  <button
                    type="button"
                    onClick={() => setImportStep(3)}
                    className="px-4 py-2 text-xs font-semibold text-[#1E1E16] hover:bg-[#F1F0EB]/30 rounded-lg cursor-pointer"
                  >
                    Review List Again
                  </button>

                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleCommitImport}
                    className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>Confirm & Commit to Database</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: Success State */}
            {importStep === 5 && (
              <div className="text-center py-6 space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#E4E0D5] border border-[#9B8A79]/40 text-[#1E1E16] flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-[#1E1E16]">Import Completed!</h4>
                <p className="text-xs text-[#9B8A79]">
                  Successfully imported <strong>{importSuccess}</strong> new student record(s) into this class.
                </p>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={resetImportModal}
                    className="px-6 py-2 rounded-lg text-xs font-bold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Add Student */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-[#1E1E16]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-3">
              <h3 className="text-base font-bold text-[#1E1E16] flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#1E1E16]" />
                Add Student
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
                  Registration Number * (Text format preserved)
                </label>
                <input
                  type="text"
                  placeholder="Enter student registration number"
                  value={regNo}
                  onChange={(e) => setRegNo(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                  Full Student Name *
                </label>
                <input
                  type="text"
                  placeholder="Enter full student name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                  Roll Number (Optional — separate from Register Number)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1, 2, 3 (auto-assigned sequentially if left blank)"
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
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
                  {isSubmitting ? 'Saving...' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Student */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-[#1E1E16]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#9B8A79]/40 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#9B8A79]/40 pb-3">
              <h3 className="text-base font-bold text-[#1E1E16] flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#1E1E16]" />
                Edit Student Details
              </h3>
              <button onClick={() => setEditingStudent(null)} className="text-[#9B8A79] hover:text-[#1E1E16]">
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
                  Registration Number *
                </label>
                <input
                  type="text"
                  value={regNo}
                  onChange={(e) => setRegNo(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                  Full Student Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E1E16] mb-1">
                  Roll Number
                </label>
                <input
                  type="text"
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-[#9B8A79]/40 rounded-lg text-[#1E1E16] focus:outline-none focus:border-[#1E1E16]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="studentActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-[#1E1E16] rounded border-[#9B8A79]/40 cursor-pointer"
                />
                <label htmlFor="studentActive" className="text-xs font-medium text-[#1E1E16] cursor-pointer">
                  Student is currently Active in this class
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#9B8A79]/40">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 text-xs font-medium text-[#1E1E16] hover:bg-[#F1F0EB]/30 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-[#F1F0EB] bg-[#A7674D] hover:bg-[#6C6B50] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
