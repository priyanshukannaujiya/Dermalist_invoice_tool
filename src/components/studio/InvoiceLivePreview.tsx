"use client";

import React from "react";
import { InvoiceDraft } from "@/types/invoice";
import { formatCurrencyINR, resolveBankName } from "@/lib/utils";
import { Building2, CheckCircle2, AlertCircle, ShieldCheck, ExternalLink, RefreshCw } from "lucide-react";

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
    <div className="relative bg-white border border-slate-200/90 rounded-xl shadow-sm p-6 sm:p-8 flex flex-col justify-between overflow-hidden">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-xs z-30 flex flex-col items-center justify-center gap-2.5">
          <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-slate-700">
            Parsing invoice and merging database credentials...
          </p>
        </div>
      )}

      {/* Invoice Document Canvas */}
      <div className="space-y-6">
        {/* Missing Credentials Alert Banner */}
        {isMissingBankDetails && (
          <div className="bg-amber-50/90 border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Incomplete Bank Credentials:</strong> PAN, Account Number, or IFSC are missing.
              </span>
            </div>
            {onEditCreator && (
              <button
                type="button"
                onClick={onEditCreator}
                className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white font-medium rounded-md text-[11px] self-start sm:self-auto cursor-pointer transition-colors shrink-0 shadow-xs"
              >
                Enter Bank Details
              </button>
            )}
          </div>
        )}

        {/* Title Bar & Status Badges */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Non-GST Invoice
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 font-sans">
              INVOICE
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isMissingBankDetails && invoice.creatorMatched && c.name?.trim() ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                Verified Creator
              </span>
            ) : c.name?.trim() ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                Incomplete Details
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                Draft
              </span>
            )}
          </div>
        </div>

        {/* Creator Info (Left) & Metadata (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Creator details */}
          <div className="space-y-1 text-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-0.5">
              Creator (Payee)
            </div>
            <h2 className="font-semibold text-sm text-slate-900 tracking-tight">
              {c.name || <span className="text-slate-400 italic">Creator Name</span>}
            </h2>
            <p className="text-slate-600 text-xs leading-relaxed max-w-sm whitespace-pre-line">
              {c.address || <span className="text-slate-400 italic">Address in details state pin code</span>}
            </p>
            <div className="pt-2 space-y-0.5 text-slate-600 text-xs">
              <p>
                <strong className="text-slate-700 font-medium">Email ID:</strong> {c.email || "—"}
              </p>
              <p>
                <strong className="text-slate-700 font-medium">Contact Number:</strong> {c.phone || "—"}
              </p>
              <p>
                <strong className="text-slate-700 font-medium">PAN Number:</strong>{" "}
                <span className="font-mono">{c.pan || "—"}</span>
              </p>
            </div>
          </div>

          {/* Invoice Metadata Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3.5 text-xs space-y-2">
            <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
              <span className="font-medium text-slate-600">Invoice No:</span>
              <span className="font-mono font-bold text-slate-950 text-xs">
                {invoice.invoice_number || "DL-001"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Invoice Date:</span>
              <span className="font-medium text-slate-900 font-mono">{invoice.invoice_date}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Terms of Payment:</span>
              <span className="font-medium text-slate-900">{invoice.payment_terms || "Bank Transfer Or UPICode"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">MSME Regsistration Status :</span>
              <span className="font-medium text-slate-900 font-mono">YES / NO</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">If Yes : MSME No :</span>
              <span className="font-mono text-slate-900 text-[11px]">UDYAM-MH-18-0490710</span>
            </div>
          </div>
        </div>

        {/* Bill-To Section (B M M RETAIL PRIVATE LIMITED) */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-3.5 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            <Building2 className="w-3 h-3" />
            <span>BILL TO</span>
          </div>
          <div className="font-semibold text-slate-900 text-xs">B M M RETAIL PRIVATE LIMITED</div>
          <p className="text-slate-600 leading-normal text-xs">
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
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <th className="py-2.5 px-4 font-medium">DESCRIPTION</th>
                <th className="py-2.5 px-4 text-right w-40 font-medium">Taxable Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-white">
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-900 text-xs">
                    {invoice.quantity > 1 ? `${invoice.quantity} x ` : ""}
                    {invoice.service_description || "Promotional Video for Dermalist"}
                  </div>
                  {invoice.video_link && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 font-medium">
                      <span>Video Link:</span>
                      <a
                        href={invoice.video_link}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-blue-800 inline-flex items-center gap-0.5"
                      >
                        {invoice.video_link}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-right font-medium text-slate-900 font-mono text-xs">
                  {formatCurrencyINR(invoice.taxable_value)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Totals & Breakdown */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-1">
          {/* Note & Signature */}
          <div className="text-xs text-slate-400 space-y-3 max-w-xs">
            <p className="italic text-[11px]">Thank you for your business!</p>
            <div className="pt-2">
              <div className="border-b border-slate-300 w-32 mb-1" />
              <span className="text-[11px] text-slate-500 font-medium">Authorized Signature</span>
            </div>
          </div>

          {/* Calculations Box */}
          <div className="w-full sm:w-72 bg-slate-50 rounded-lg p-3 space-y-1.5 text-xs border border-slate-200/80 font-sans">
            <div className="flex justify-between items-center text-slate-600">
              <span>SUBTOTAL:</span>
              <span className="font-mono font-medium">{formatCurrencyINR(invoice.taxable_value)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>DISCOUNT:</span>
              <span className="font-mono font-medium text-red-600">
                - {formatCurrencyINR(invoice.discount)}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-700 font-medium border-t border-slate-200 pt-1.5">
              <span>SUBTOTAL LESS DISCOUNT:</span>
              <span className="font-mono">{formatCurrencyINR(invoice.subtotal_less_discount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-950 font-bold text-xs bg-white px-2.5 py-1.5 rounded border border-slate-200 shadow-2xs">
              <span>BALANCE DUE:</span>
              <span className="font-mono text-sm text-emerald-700">{formatCurrencyINR(invoice.balance_due)}</span>
            </div>
          </div>
        </div>

        {/* Banking and Settlement Info */}
        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
              Settlement & Banking Credentials
            </div>
            {onSyncCreator && c.name && (
              <button
                type="button"
                onClick={onSyncCreator}
                className="text-[11px] text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                title="Re-query database for this creator's bank account"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Re-sync Database</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200/70 font-mono">
            <div>
              <span className="font-sans text-slate-500 font-medium">UPI ID:</span> {c.upi_id || "Not provided"}
            </div>
            <div>
              <span className="font-sans text-slate-500 font-medium">Bank Account:</span>{" "}
              {c.bank_account ? (
                <span>•••• {c.bank_account.slice(-4)} ({c.bank_account})</span>
              ) : (
                <span className="text-amber-600 italic">Not provided</span>
              )}
            </div>
            <div>
              <span className="font-sans text-slate-500 font-medium">IFSC Code:</span>{" "}
              {c.ifsc ? <span className="font-bold text-slate-900">{c.ifsc}</span> : <span className="text-amber-600 italic">Not provided</span>}
            </div>
            <div>
              <span className="font-sans text-slate-500 font-medium">Account Holder:</span>{" "}
              {c.account_holder || c.name || "—"}
            </div>
            {resolveBankName(c.bank_name, c.ifsc) ? (
              <div className="sm:col-span-2">
                <span className="font-sans text-slate-500 font-medium">Bank Name:</span> {resolveBankName(c.bank_name, c.ifsc)}
              </div>
            ) : (
              <div className="sm:col-span-2 text-slate-400 italic">
                <span className="font-sans text-slate-500 font-medium not-italic">Bank Name:</span> Not specified
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
