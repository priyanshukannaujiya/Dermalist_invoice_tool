"use client";

import React from "react";
import { InvoiceDraft } from "@/types/invoice";
import { formatCurrencyINR } from "@/lib/utils";
import { Building2, CheckCircle2, AlertCircle, ShieldCheck, ExternalLink } from "lucide-react";

interface InvoiceLivePreviewProps {
  invoice: InvoiceDraft;
  isLoading?: boolean;
  onEditCreator?: () => void;
  onSyncCreator?: () => void;
}

export function InvoiceLivePreview({
  invoice,
  isLoading,
  onEditCreator,
  onSyncCreator,
}: InvoiceLivePreviewProps) {
  const c = invoice.creator || { name: "" };
  const isMissingBankDetails =
    Boolean(c.name?.trim()) &&
    (!c.pan?.trim() || !c.bank_account?.trim() || !c.ifsc?.trim());

  return (
    <div className="relative bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/50 p-6 sm:p-8 flex flex-col justify-between overflow-hidden">
      {/* Decorative top sheet bar */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/75 backdrop-blur-xs z-30 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-slate-800 animate-pulse">
            Analyzing with Groq AI & Merging Database Credentials...
          </p>
        </div>
      )}

      {/* Invoice Document Canvas */}
      <div className="space-y-6">
        {/* Missing Credentials Alert Banner */}
        {isMissingBankDetails && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Missing Bank Credentials:</strong> PAN, Account Number, or IFSC are incomplete.
                The Excel file will have blank values in settlement rows.
              </span>
            </div>
            {onEditCreator && (
              <button
                type="button"
                onClick={onEditCreator}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-[11px] self-start sm:self-auto cursor-pointer transition-colors shrink-0 shadow-xs"
              >
                Enter Bank Details
              </button>
            )}
          </div>
        )}

        {/* Title Bar & Status Badges */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Non-GST Master Layout
            </span>
            <h1 className="text-3xl font-display font-extrabold tracking-tight text-slate-900">
              INVOICE
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isMissingBankDetails && invoice.creatorMatched && c.name?.trim() ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verified Creator
              </span>
            ) : c.name?.trim() ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <AlertCircle className="w-3.5 h-3.5" />
                Incomplete Details
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Draft
              </span>
            )}

            {c.is_msme && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                MSME Registered
              </span>
            )}
          </div>
        </div>

        {/* Creator Info (Left) & Metadata (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Creator details */}
          <div className="space-y-1 text-sm">
            <h2 className="font-bold text-base text-slate-900 tracking-tight">
              {c.name || <span className="text-slate-400 italic">Creator Name</span>}
            </h2>
            <p className="text-slate-600 text-xs leading-relaxed max-w-sm whitespace-pre-line">
              {c.address || <span className="text-slate-400 italic">Address in details state pin code</span>}
            </p>
            <div className="pt-2 space-y-0.5 text-xs text-slate-600">
              <p>
                <strong className="text-slate-700">Email ID:</strong> {c.email || "—"}
              </p>
              <p>
                <strong className="text-slate-700">Contact Number:</strong> {c.phone || "—"}
              </p>
              <p>
                <strong className="text-slate-700">PAN Number:</strong>{" "}
                <span className="font-mono font-medium">{c.pan || "—"}</span>
              </p>
            </div>
          </div>

          {/* Invoice Metadata Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs space-y-2">
            <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
              <span className="font-semibold text-slate-600">Invoice No:</span>
              <span className="font-mono font-bold text-emerald-700 text-sm">
                {invoice.invoice_number || "DL-001"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Invoice Date:</span>
              <span className="font-medium text-slate-900">{invoice.invoice_date}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Terms of Payment:</span>
              <span className="font-medium text-slate-900">{invoice.payment_terms || "Bank Transfer Or UPICode"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">MSME Status:</span>
              <span className={`font-semibold ${c.is_msme ? "text-blue-700" : "text-slate-700"}`}>
                {c.is_msme ? "YES" : "NO"}
              </span>
            </div>
            {c.is_msme && c.msme_registration_no && (
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-600">UDYAM Reg No:</span>
                <span className="font-mono text-slate-800">{c.msme_registration_no}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bill-To Section (B M M RETAIL PRIVATE LIMITED) */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
            <Building2 className="w-3.5 h-3.5" />
            <span>BILL TO</span>
          </div>
          <div className="font-bold text-slate-900 text-sm">B M M RETAIL PRIVATE LIMITED</div>
          <p className="text-slate-600 leading-normal">
            THIRD, 307 A, FAIZ E QUTBI BUILDING, PLOT NO 375, Narsi Natha Street, Masjid Bander Maharashtra, 400009
          </p>
          <div className="flex flex-wrap gap-x-4 pt-1 text-slate-500 text-[11px]">
            <span>
              <strong>Contact:</strong> 88509 80156
            </span>
            <span>
              <strong>Email:</strong> info@dermalist.in
            </span>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3 px-4">DESCRIPTION</th>
                <th className="py-3 px-4 text-right w-40">Taxable Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-white">
                <td className="py-3.5 px-4">
                  <div className="font-medium text-slate-900 text-sm">
                    {invoice.quantity > 1 ? `${invoice.quantity} x ` : ""}
                    {invoice.service_description || "Promotional Video for Dermalist"}
                  </div>
                  {invoice.video_link && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <span>Video Link:</span>
                      <a
                        href={invoice.video_link}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-emerald-700 inline-flex items-center gap-0.5"
                      >
                        {invoice.video_link}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </td>
                <td className="py-3.5 px-4 text-right font-semibold text-slate-900 text-sm">
                  {formatCurrencyINR(invoice.taxable_value)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Totals & Breakdown */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-2">
          {/* Note & Signature */}
          <div className="text-xs text-slate-500 space-y-4 max-w-xs">
            <p className="italic">Thank you for your business!</p>
            <div className="pt-4">
              <div className="border-b border-slate-300 w-36 mb-1" />
              <span className="font-medium text-slate-700">Signature</span>
            </div>
          </div>

          {/* Calculations Box */}
          <div className="w-full sm:w-72 bg-slate-50 rounded-xl p-3.5 space-y-2 text-xs border border-slate-200/80">
            <div className="flex justify-between items-center text-slate-600">
              <span>SUBTOTAL:</span>
              <span className="font-medium">{formatCurrencyINR(invoice.taxable_value)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>DISCOUNT:</span>
              <span className="font-medium text-red-600">
                - {formatCurrencyINR(invoice.discount)}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-700 font-semibold border-t border-slate-200 pt-1.5">
              <span>SUBTOTAL LESS DISCOUNT:</span>
              <span>{formatCurrencyINR(invoice.subtotal_less_discount)}</span>
            </div>
            <div className="flex justify-between items-center text-emerald-700 font-bold text-sm bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
              <span>BALANCE DUE:</span>
              <span>{formatCurrencyINR(invoice.balance_due)}</span>
            </div>
          </div>
        </div>

        {/* Banking and Settlement Info */}
        <div className="border-t border-slate-200 pt-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Settlement & Banking Credentials
            </div>
            {onSyncCreator && c.name && (
              <button
                type="button"
                onClick={onSyncCreator}
                className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                title="Re-query database for this creator's bank account"
              >
                <span>Re-fetch from Database</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 bg-slate-50/60 p-3 rounded-xl border border-slate-200/60 font-mono">
            <div>
              <strong className="font-sans text-slate-500">UPI ID:</strong> {c.upi_id || "Not provided"}
            </div>
            <div>
              <strong className="font-sans text-slate-500">Bank Account:</strong>{" "}
              {c.bank_account ? (
                <span>•••• •••• {c.bank_account.slice(-4)} ({c.bank_account})</span>
              ) : (
                <span className="text-amber-600 italic">Not provided</span>
              )}
            </div>
            <div>
              <strong className="font-sans text-slate-500">IFSC Code:</strong>{" "}
              {c.ifsc ? <span className="font-bold text-slate-800">{c.ifsc}</span> : <span className="text-amber-600 italic">Not provided</span>}
            </div>
            <div>
              <strong className="font-sans text-slate-500">Account Holder:</strong>{" "}
              {c.account_holder || c.name || "—"}
            </div>
            {c.bank_name ? (
              <div className="sm:col-span-2">
                <strong className="font-sans text-slate-500">Bank Name:</strong> {c.bank_name}
              </div>
            ) : (
              <div className="sm:col-span-2 text-slate-400 italic">
                <strong className="font-sans text-slate-500 not-italic">Bank Name:</strong> Not specified
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
