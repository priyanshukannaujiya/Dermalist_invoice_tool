"use client";

import React, { useState, useEffect } from "react";
import { Invoice, Creator } from "@/lib/db";
import {
  History,
  Search,
  FileSpreadsheet,
  FileText,
  Calendar,
  CheckCircle2,
  Download,
  Trash2,
  ExternalLink,
  Loader2,
  IndianRupee,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyINR } from "@/lib/utils";

export default function InvoicesArchivePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/invoices?search=${encodeURIComponent(searchTerm)}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      toast.error("Failed to load invoice history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadInvoices, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleDownloadExcel = async (inv: Invoice) => {
    try {
      setDownloadingId(`excel-${inv.id}`);

      let creatorData: Partial<Creator> = {
        name: inv.creator_name,
      };

      if (inv.creator_id) {
        const cRes = await fetch(`/api/creators/${inv.creator_id}`);
        if (cRes.ok) {
          creatorData = await cRes.json();
        }
      }
      if (!creatorData.bank_account && inv.creator_name) {
        const cRes = await fetch(`/api/creators?search=${encodeURIComponent(inv.creator_name)}&limit=1`);
        if (cRes.ok) {
          const cData = await cRes.json();
          if (cData.creators && cData.creators.length > 0) {
            creatorData = cData.creators[0];
          }
        }
      }

      const payload = {
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        payment_terms: inv.payment_terms || "Bank Transfer Or UPICode",
        service_description: inv.service_description,
        quantity: inv.quantity || 1,
        unit_price: Number(inv.unit_price) || Number(inv.taxable_value),
        taxable_value: Number(inv.taxable_value),
        discount: Number(inv.discount) || 0,
        subtotal_less_discount: Number(inv.subtotal_less_discount),
        balance_due: Number(inv.balance_due),
        video_link: inv.video_link,
        creator: creatorData,
      };

      const res = await fetch("/api/export/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to export Excel.");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.creator_name.replace(/[^a-zA-Z0-9_-]/g, "_")}_Invoice_${inv.invoice_number}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`Downloaded Excel for ${inv.invoice_number}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to download Excel workbook.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadPdf = async (inv: Invoice) => {
    try {
      setDownloadingId(`pdf-${inv.id}`);

      let creatorData: Partial<Creator> = {
        name: inv.creator_name,
      };

      if (inv.creator_id) {
        const cRes = await fetch(`/api/creators/${inv.creator_id}`);
        if (cRes.ok) {
          creatorData = await cRes.json();
        }
      }
      if (!creatorData.bank_account && inv.creator_name) {
        const cRes = await fetch(`/api/creators?search=${encodeURIComponent(inv.creator_name)}&limit=1`);
        if (cRes.ok) {
          const cData = await cRes.json();
          if (cData.creators && cData.creators.length > 0) {
            creatorData = cData.creators[0];
          }
        }
      }

      const payload = {
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        payment_terms: inv.payment_terms || "Bank Transfer Or UPICode",
        service_description: inv.service_description,
        quantity: inv.quantity || 1,
        unit_price: Number(inv.unit_price) || Number(inv.taxable_value),
        taxable_value: Number(inv.taxable_value),
        discount: Number(inv.discount) || 0,
        subtotal_less_discount: Number(inv.subtotal_less_discount),
        balance_due: Number(inv.balance_due),
        video_link: inv.video_link,
        creator: creatorData,
      };

      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to export PDF.");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.creator_name.replace(/[^a-zA-Z0-9_-]/g, "_")}_Invoice_${inv.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`Downloaded PDF for ${inv.invoice_number}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to download PDF document.");
    } finally {
      setDownloadingId(null);
    }
  };

  // Calculate total billing value in currently loaded invoices
  const totalBilled = invoices.reduce((acc, curr) => acc + (Number(curr.balance_due) || 0), 0);

  return (
    <div className="flex-1 bg-slate-50/70 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1 font-mono">
              <span>Finance Ops</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-800 font-medium">Invoice Archive</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
                Invoice Archive
              </h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                {total} Invoices
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-xl px-3.5 py-2 shadow-xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-mono">
              <IndianRupee className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-medium text-slate-400 uppercase tracking-wider">
                Total Billed
              </div>
              <div className="text-sm font-bold font-mono text-slate-950">{formatCurrencyINR(totalBilled)}</div>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-xs flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by invoice number, creator name, or service..."
              className="w-full text-xs rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>

          <div className="text-xs text-slate-500 font-mono text-[11px]">
            Showing {invoices.length} of {total}
          </div>
        </div>

        {/* Invoices Table */}
        <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Invoice No</th>
                  <th className="py-3 px-4">Creator / Influencer</th>
                  <th className="py-3 px-4">Service & Link</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                        <span>Loading invoice archive...</span>
                      </div>
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No invoices found. Generate an invoice in the AI Studio to populate this archive.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Invoice No */}
                      <td className="py-3.5 px-4 align-top">
                        <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs">
                          {inv.invoice_number}
                        </span>
                      </td>

                      {/* Creator */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-slate-900 text-sm">{inv.creator_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {inv.creator_id ? "Linked to Directory" : "Ad-hoc Creator"}
                        </div>
                      </td>

                      {/* Service & Link */}
                      <td className="py-3.5 px-4 align-top max-w-xs">
                        <div className="text-slate-800 font-medium line-clamp-2">
                          {inv.service_description}
                        </div>
                        {inv.video_link && (
                          <a
                            href={inv.video_link}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 text-[11px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1 truncate"
                          >
                            <span>Link</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 align-top text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{inv.invoice_date}</span>
                        </div>
                      </td>

                      {/* Balance Due */}
                      <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-sm">
                          {formatCurrencyINR(inv.balance_due)}
                        </div>
                        {Number(inv.discount) > 0 && (
                          <div className="text-[10px] text-red-500">
                            Disc: {formatCurrencyINR(inv.discount)}
                          </div>
                        )}
                      </td>

                      {/* Actions: Excel & PDF download */}
                      <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleDownloadExcel(inv)}
                            disabled={downloadingId === `excel-${inv.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer disabled:opacity-50"
                            title="Download Excel Workbook"
                          >
                            {downloadingId === `excel-${inv.id}` ? (
                              <Loader2 className="w-3 h-3 animate-spin text-emerald-700" />
                            ) : (
                              <FileSpreadsheet className="w-3 h-3 text-emerald-700" />
                            )}
                            <span>Excel</span>
                          </button>

                          <button
                            onClick={() => handleDownloadPdf(inv)}
                            disabled={downloadingId === `pdf-${inv.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                            title="Download PDF Document"
                          >
                            {downloadingId === `pdf-${inv.id}` ? (
                              <Loader2 className="w-3 h-3 animate-spin text-slate-600" />
                            ) : (
                              <FileText className="w-3 h-3 text-slate-600" />
                            )}
                            <span>PDF</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
