"use client";

import React, { useState } from "react";
import { InvoiceDraft } from "@/types/invoice";
import { formatCurrencyINR } from "@/lib/utils";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, BookmarkCheck, Copy, Check, Loader2 } from "lucide-react";

interface ActionToolbarProps {
  invoice: InvoiceDraft;
  onSaved?: () => void;
}

export function ActionToolbar({ invoice, onSaved }: ActionToolbarProps) {
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [savingHistory, setSavingHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const triggerConfetti = () => {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: ["#10b981", "#059669", "#34d399", "#3b82f6"],
    });
  };

  const handleDownloadExcel = async () => {
    try {
      setDownloadingExcel(true);
      const res = await fetch("/api/export/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoice),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate Excel file.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanName = (invoice.creator?.name || "Creator").replace(/[^a-zA-Z0-9_-]/g, "_");
      a.download = `${cleanName}_Invoice_${invoice.invoice_number}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      triggerConfetti();
      toast.success("Excel (.xlsx) workbook downloaded successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to download Excel file.");
    } finally {
      setDownloadingExcel(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoice),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate PDF document.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanName = (invoice.creator?.name || "Creator").replace(/[^a-zA-Z0-9_-]/g, "_");
      a.download = `${cleanName}_Invoice_${invoice.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      triggerConfetti();
      toast.success("PDF document downloaded successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to download PDF document.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSaveToHistory = async () => {
    try {
      setSavingHistory(true);
      const payload = {
        invoice_number: invoice.invoice_number,
        creator_id: invoice.creator?.id || null,
        creator_name: invoice.creator?.name || "Creator",
        invoice_date: invoice.invoice_date,
        service_description: invoice.service_description,
        quantity: invoice.quantity,
        unit_price: invoice.unit_price,
        taxable_value: invoice.taxable_value,
        discount: invoice.discount,
        subtotal_less_discount: invoice.subtotal_less_discount,
        balance_due: invoice.balance_due,
        payment_terms: invoice.payment_terms,
        video_link: invoice.video_link,
        status: "Generated",
        raw_prompt: invoice.raw_prompt,
      };

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save invoice.");
      }

      toast.success(`Invoice ${invoice.invoice_number} saved to archive!`);
      if (onSaved) onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save invoice to database.");
    } finally {
      setSavingHistory(false);
    }
  };

  const handleCopySummary = () => {
    const summary = [
      `Dermalist Non-GST Invoice Summary`,
      `Invoice No: ${invoice.invoice_number}`,
      `Date: ${invoice.invoice_date}`,
      `Creator: ${invoice.creator?.name || "N/A"}`,
      `Service: ${invoice.service_description}`,
      `Taxable Value: ${formatCurrencyINR(invoice.taxable_value)}`,
      `Discount: ${formatCurrencyINR(invoice.discount)}`,
      `Balance Due: ${formatCurrencyINR(invoice.balance_due)}`,
      `Payment Details: Bank ${invoice.creator?.bank_name || "N/A"}, A/C: ${invoice.creator?.bank_account || "N/A"}, IFSC: ${invoice.creator?.ifsc || "N/A"}`,
    ].join("\n");

    navigator.clipboard.writeText(summary);
    setCopied(true);
    toast.success("Invoice summary copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={handleDownloadExcel}
          disabled={downloadingExcel}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 transition-all shadow-xs disabled:opacity-60 cursor-pointer"
        >
          {downloadingExcel ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
          )}
          <span>Download Excel (.xlsx)</span>
        </button>

        <button
          onClick={handleDownloadPdf}
          disabled={downloadingPdf}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-xs disabled:opacity-60 cursor-pointer"
        >
          {downloadingPdf ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
          ) : (
            <FileText className="w-4 h-4 text-emerald-400" />
          )}
          <span>Download PDF</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSaveToHistory}
          disabled={savingHistory}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all border border-slate-200 cursor-pointer disabled:opacity-60"
        >
          {savingHistory ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <BookmarkCheck className="w-3.5 h-3.5 text-slate-600" />
          )}
          <span>Save to History</span>
        </button>

        <button
          onClick={handleCopySummary}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all border border-slate-200 cursor-pointer"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-600" />
          )}
          <span>{copied ? "Copied!" : "Copy Summary"}</span>
        </button>
      </div>
    </div>
  );
}
