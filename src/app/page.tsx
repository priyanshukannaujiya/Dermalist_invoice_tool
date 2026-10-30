"use client";

import React, { useState, useEffect } from "react";
import { InvoiceDraft, CreatorProfile } from "@/types/invoice";
import { AIPromptStudio } from "@/components/studio/AIPromptStudio";
import { ManualInvoiceForm } from "@/components/studio/ManualInvoiceForm";
import { InvoiceLivePreview } from "@/components/studio/InvoiceLivePreview";
import { ActionToolbar } from "@/components/studio/ActionToolbar";
import { MissingCreatorModal } from "@/components/studio/MissingCreatorModal";
import { Sparkles, Edit3, Eye, FileText, CheckCircle2 } from "lucide-react";
import { formatDateDDMMYYYY } from "@/lib/utils";

export default function StudioPage() {
  const [activeTab, setActiveTab] = useState<"ai" | "manual">("ai");
  const [isLoading, setIsLoading] = useState(false);
  const [botReply, setBotReply] = useState<string | null>(null);
  const [missingModalOpen, setMissingModalOpen] = useState(false);
  const [pendingCreatorName, setPendingCreatorName] = useState("");

  const [invoice, setInvoice] = useState<InvoiceDraft>({
    invoice_number: "DL-001",
    invoice_date: formatDateDDMMYYYY(new Date()),
    payment_terms: "Bank Transfer Or UPICode",
    service_description: "1 x Promotional Video for Dermalist",
    quantity: 1,
    unit_price: 2500,
    taxable_value: 2500,
    discount: 0,
    subtotal_less_discount: 2500,
    balance_due: 2500,
    video_link: "",
    creatorMatched: true,
    creator: {
      name: "Aaditi Abhijeet Raut",
      address: "Flat 402, Green Heights, Andheri West, Mumbai, Maharashtra 400053",
      email: "aaditi.raut@example.com",
      phone: "+91 98765 43210",
      pan: "ABCDE1234F",
      bank_name: "HDFC Bank",
      bank_account: "50100234567890",
      ifsc: "HDFC0000123",
      account_holder: "Aaditi Abhijeet Raut",
      upi_id: "aaditi@okhdfcbank",
      is_msme: false,
      msme_registration_no: "",
    },
  });

  // Fetch the next sequential invoice number on initial mount
  useEffect(() => {
    fetch("/api/invoices/next-number")
      .then((res) => res.json())
      .then((data) => {
        if (data.nextInvoiceNumber) {
          setInvoice((prev) => ({ ...prev, invoice_number: data.nextInvoiceNumber }));
        }
      })
      .catch((err) => console.error("Error fetching next invoice number:", err));
  }, []);

  const handleAIParsed = (data: any) => {
    setBotReply(data.botReply);

    const updatedCreator: CreatorProfile = data.creator || {
      name: data.creatorName || "",
      address: "",
      email: "",
      phone: "",
      pan: "",
      bank_name: "",
      bank_account: "",
      ifsc: "",
      account_holder: data.creatorName || "",
      upi_id: "",
      is_msme: false,
      msme_registration_no: "",
    };

    setInvoice((prev) => ({
      ...prev,
      invoice_date: data.date || prev.invoice_date,
      service_description: data.description || prev.service_description,
      quantity: data.quantity || 1,
      unit_price: data.unitPrice || data.taxableValue,
      taxable_value: data.taxableValue,
      discount: data.discount,
      subtotal_less_discount: data.subtotal - data.discount,
      balance_due: data.balanceDue,
      video_link: data.deliverableLink || "",
      creator: updatedCreator,
      creatorMatched: data.creatorMatched,
      raw_prompt: data.rawPrompt,
    }));

    if (data.requiresCreatorDetails && data.creatorName) {
      setPendingCreatorName(data.creatorName);
      setMissingModalOpen(true);
    }
  };

  const handleMissingCreatorSaved = (savedCreator: CreatorProfile) => {
    setInvoice((prev) => ({
      ...prev,
      creator: savedCreator,
      creatorMatched: true,
    }));
  };

  return (
    <div className="flex-1 bg-slate-50/50 bg-grid-pattern py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Hero Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Workspace
              </span>
              <span className="text-xs text-slate-500 font-medium">B M M Retail Private Limited</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-slate-900 mt-1">
              AI Invoice Studio
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Conversational non-GST billing for influencers and creators with live Excel & PDF generation.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-xl shadow-xs self-start">
            <button
              onClick={() => setActiveTab("ai")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "ai"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Prompt Studio</span>
            </button>
            <button
              onClick={() => setActiveTab("manual")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "manual"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Manual Form</span>
            </button>
          </div>
        </div>

        {/* Dual-Mode Split Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Panel: AI Prompt or Manual Form */}
          <div className="lg:col-span-5 space-y-4">
            {activeTab === "ai" ? (
              <AIPromptStudio
                onParsed={handleAIParsed}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                botReply={botReply}
                currentInvoice={invoice}
              />
            ) : (
              <ManualInvoiceForm invoice={invoice} onChange={setInvoice} />
            )}
          </div>

          {/* Right Panel: Live Visual Invoice Preview & Quick Actions */}
          <div className="lg:col-span-7 space-y-4">
            {/* Action Toolbar */}
            <ActionToolbar
              invoice={invoice}
              onSaved={() => {
                fetch("/api/invoices/next-number")
                  .then((res) => res.json())
                  .then((data) => {
                    if (data.nextInvoiceNumber) {
                      setInvoice((prev) => ({ ...prev, invoice_number: data.nextInvoiceNumber }));
                    }
                  });
              }}
            />

            {/* Live Branded Invoice Sheet */}
            <InvoiceLivePreview
              invoice={invoice}
              isLoading={isLoading}
              onEditCreator={() => {
                setPendingCreatorName(invoice.creator?.name || "Creator");
                setMissingModalOpen(true);
              }}
            />
          </div>
        </div>
      </div>

      {/* Missing Creator Detail Modal */}
      <MissingCreatorModal
        isOpen={missingModalOpen}
        onClose={() => setMissingModalOpen(false)}
        creatorName={pendingCreatorName || invoice.creator?.name || ""}
        initialCreator={invoice.creator}
        onSaveCreator={handleMissingCreatorSaved}
      />
    </div>
  );
}
