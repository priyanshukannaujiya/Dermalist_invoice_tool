"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  Download,
  Loader2,
  RefreshCw,
  Building,
  CreditCard,
  ShieldCheck,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseCreatorCsv,
  parseCreatorExcel,
  ParsedCreatorRow,
  ImportSummary,
} from "@/lib/creator-importer";

interface CreatorImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (result: { total: number; inserted: number; updated: number }) => void;
}

export function CreatorImportModal({
  isOpen,
  onClose,
  onImportSuccess,
}: CreatorImportModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedSummary, setParsedSummary] = useState<ImportSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setSelectedFile(null);
    setParsedSummary(null);
    setParsing(false);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith(".csv");
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

    if (!isCsv && !isExcel) {
      toast.error("Please upload a CSV (.csv) or Excel (.xlsx, .xls) file.");
      return;
    }

    try {
      setParsing(true);
      setSelectedFile(file);

      if (isCsv) {
        const text = await file.text();
        const summary = parseCreatorCsv(text);
        setParsedSummary(summary);
      } else {
        const arrayBuf = await file.arrayBuffer();
        const summary = parseCreatorExcel(Buffer.from(arrayBuf));
        setParsedSummary(summary);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to parse file.");
      setSelectedFile(null);
      setParsedSummary(null);
    } finally {
      setParsing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDownloadTemplate = (format: "csv" | "xlsx") => {
    window.open(`/api/creators/template?format=${format}`, "_blank");
    toast.success(`Downloaded sample ${format.toUpperCase()} template!`);
  };

  const handleConfirmImport = async () => {
    if (!parsedSummary || parsedSummary.validRows.length === 0) {
      toast.error("No valid creator records to import.");
      return;
    }

    try {
      setUploading(true);

      const res = await fetch("/api/creators/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creators: parsedSummary.validRows }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to import creators.");
      }

      const data = await res.json();
      toast.success(
        `Import Complete! ${data.inserted} added, ${data.updated} updated.`
      );

      if (onImportSuccess) {
        onImportSuccess({
          total: data.total,
          inserted: data.inserted,
          updated: data.updated,
        });
      }

      handleClose();
    } catch (err: any) {
      toast.error(err.message || "Import failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Bulk Import
              </span>
              <span className="text-xs text-slate-500">CSV & Excel Parser</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 mt-1">
              Upload Creators & Bank Accounts
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Upload your spreadsheet to bulk-populate or update creators with full bank account details.
            </p>
          </div>

          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
          {/* Download Sample Templates Banner */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <strong className="text-emerald-950 font-semibold flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                Need a pre-formatted template?
              </strong>
              <p className="text-emerald-800 text-[11px]">
                Download our sample spreadsheet with all columns (Creator Name, PAN, Bank Name, A/C No, IFSC, UPI, MSME).
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadTemplate("csv")}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-emerald-100/60 border border-emerald-300 text-emerald-900 rounded-lg font-medium text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>Sample CSV</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTemplate("xlsx")}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Sample Excel (.xlsx)</span>
              </button>
            </div>
          </div>

          {/* Upload Drop Area */}
          {!selectedFile ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                dragActive
                  ? "border-emerald-500 bg-emerald-50/70 scale-[0.99]"
                  : "border-slate-300 hover:border-emerald-400 hover:bg-slate-50/80 bg-white"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 shadow-inner">
                <UploadCloud className="w-7 h-7" />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Click to select file or drag & drop here
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports <strong>.CSV</strong> and <strong>.XLSX / .XLS</strong> files with bank account details
                </p>
              </div>

              <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Smart column header matching & validation</span>
              </div>
            </div>
          ) : (
            /* File Loaded & Parsed Preview Area */
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">
                      {selectedFile.name}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      {(selectedFile.size / 1024).toFixed(1)} KB &bull;{" "}
                      {parsedSummary?.totalRows || 0} total records detected
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetState}
                  className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg font-medium transition-colors cursor-pointer text-xs flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Choose Another</span>
                </button>
              </div>

              {/* Parsing Indicator */}
              {parsing && (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-600 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                  <span>Analyzing columns and validating bank details...</span>
                </div>
              )}

              {/* Stats Summary Pills */}
              {parsedSummary && !parsing && (
                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                    <div className="text-emerald-900 font-extrabold text-lg">
                      {parsedSummary.validRows.length}
                    </div>
                    <div className="text-emerald-700 text-[11px] font-medium flex items-center justify-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Ready to Import</span>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl">
                    <div className="text-blue-900 font-extrabold text-lg">
                      {parsedSummary.validRows.filter((r) => r.bank_account && r.ifsc).length}
                    </div>
                    <div className="text-blue-700 text-[11px] font-medium flex items-center justify-center gap-1 mt-0.5">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Full Bank Info</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                    <div className="text-slate-900 font-extrabold text-lg">
                      {parsedSummary.invalidRows.length}
                    </div>
                    <div className="text-slate-600 text-[11px] font-medium flex items-center justify-center gap-1 mt-0.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Skipped / Empty</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Preview Table */}
              {parsedSummary && !parsing && parsedSummary.validRows.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                    <span>
                      Previewing first{" "}
                      <strong>{Math.min(5, parsedSummary.validRows.length)}</strong> of{" "}
                      {parsedSummary.validRows.length} rows:
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Existing creators will be updated with these bank details
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <div className="overflow-x-auto max-h-48">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200 sticky top-0">
                            <th className="py-2 px-3">#</th>
                            <th className="py-2 px-3">Creator Name</th>
                            <th className="py-2 px-3">Bank Account</th>
                            <th className="py-2 px-3">IFSC</th>
                            <th className="py-2 px-3">Bank Name</th>
                            <th className="py-2 px-3">PAN</th>
                            <th className="py-2 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {parsedSummary.validRows.slice(0, 5).map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50/70">
                              <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                                {i + 1}
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-900">
                                {r.name}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-800">
                                {r.bank_account ? (
                                  <span>•••• {r.bank_account.slice(-4)}</span>
                                ) : (
                                  <span className="text-amber-600 italic">Missing A/C</span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-700">
                                {r.ifsc || "—"}
                              </td>
                              <td className="py-2 px-3 text-slate-600">
                                {r.bank_name || "—"}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-700">
                                {r.pan || "—"}
                              </td>
                              <td className="py-2 px-3">
                                {r.bank_account && r.ifsc ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                                    <Check className="w-3 h-3" /> Ready
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                                    Partial
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 shrink-0 gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={
              !parsedSummary ||
              parsedSummary.validRows.length === 0 ||
              uploading ||
              parsing
            }
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Importing Creators into PostgreSQL...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                <span>
                  Import {parsedSummary ? parsedSummary.validRows.length : 0} Creators to Database
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
