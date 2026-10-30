"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Send,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  UploadCloud,
  Users,
  ChevronDown,
  Building,
  CreditCard,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { InvoiceDraft, CreatorProfile } from "@/types/invoice";

interface AIPromptStudioProps {
  onParsed: (data: any) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  botReply: string | null;
  currentInvoice: InvoiceDraft;
  onSelectCreator?: (creator: CreatorProfile) => void;
  onOpenImportModal?: () => void;
}

const SAMPLE_PROMPTS = [
  "Generate a non-GST invoice for Aaditi Raut for ₹2,500 for one promotional video on 29 Oct 2026, discount ₹200.",
  "Create invoice for Rohan Sharma: 2 reels for ₹5,000 dated 28 Feb 2026, with link https://instagram.com/reel/abc123",
  "Bill Priya Venkat ₹3,500 for Dermalist product review photoshoot, no discount, terms UPI",
];

export function AIPromptStudio({
  onParsed,
  isLoading,
  setIsLoading,
  botReply,
  currentInvoice,
  onSelectCreator,
  onOpenImportModal,
}: AIPromptStudioProps) {
  const [prompt, setPrompt] = useState("");
  const [creatorsList, setCreatorsList] = useState<CreatorProfile[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    fetch("/api/creators?limit=50")
      .then((res) => res.json())
      .then((data) => {
        if (data.creators) setCreatorsList(data.creators);
      })
      .catch((err) => console.error("Error fetching creators for prompt studio:", err));
  }, []);

  const handleSelectCreator = (c: CreatorProfile) => {
    if (onSelectCreator) {
      onSelectCreator(c);
      toast.success(`Attached ${c.name}'s verified bank details!`);
    }
    setShowPicker(false);
    // Optionally pre-fill prompt if empty
    if (!prompt.trim()) {
      setPrompt(`Generate invoice for ${c.name} for ₹2,500 for one promotional video.`);
    }
  };

  const handleGenerate = async (textToUse?: string) => {
    const text = (textToUse || prompt).trim();
    if (!text) {
      toast.error("Please enter an invoice request prompt.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch("/api/parse-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to parse invoice with AI.");
      }

      const data = await res.json();
      onParsed({ ...data, rawPrompt: text });
      toast.success(
        data.creatorMatched
          ? `Invoice generated & matched for ${data.creatorName}!`
          : `Invoice parsed for ${data.creatorName || "Creator"}. Please verify details.`
      );
    } catch (err: any) {
      toast.error(err.message || "Error communicating with Groq AI.");
    } finally {
      setIsLoading(false);
    }
  };

  const currentCreator = currentInvoice.creator;

  return (
    <div className="space-y-4">
      {/* Privacy guarantee banner */}
      <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-900">
        <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
        <div>
          <strong className="font-semibold">Strict Data Privacy Safeguard:</strong> Sensitive creator
          financials (Bank Account Number, IFSC, PAN, UPI) are <strong>never</strong> transmitted to
          Groq or any LLM. They are queried securely on the server from PostgreSQL.
        </div>
      </div>

      {/* Creator Quick Selector & Import Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className="w-full text-left bg-slate-50 hover:bg-slate-100/80 border border-slate-300 rounded-xl px-3 py-2 flex items-center justify-between transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 truncate">
              <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate text-slate-800 font-medium">
                {currentCreator?.name ? (
                  <>
                    <strong className="text-slate-900">{currentCreator.name}</strong>
                    {currentCreator.bank_account && (
                      <span className="text-slate-500 text-[11px] ml-1.5 font-mono">
                        (•••• {currentCreator.bank_account.slice(-4)})
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-500">Pick from Uploaded Creators ({creatorsList.length})...</span>
                )}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${showPicker ? "rotate-180" : ""}`} />
          </button>

          {/* Quick Dropdown */}
          {showPicker && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
              <div className="p-2 bg-slate-50 text-[11px] text-slate-500 font-medium">
                Click any creator to bind their bank credentials:
              </div>
              {creatorsList.map((c) => (
                <button
                  key={c.id || c.name}
                  type="button"
                  onClick={() => handleSelectCreator(c)}
                  className="w-full text-left p-2.5 hover:bg-emerald-50 transition-colors flex items-center justify-between text-xs cursor-pointer group"
                >
                  <div>
                    <div className="font-semibold text-slate-900 group-hover:text-emerald-950">
                      {c.name}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {c.bank_name ? `${c.bank_name} • ` : ""}
                      {c.bank_account ? `A/C •••• ${c.bank_account.slice(-4)}` : "A/C not on file"}
                    </div>
                  </div>
                  {currentCreator?.name === c.name && (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {onOpenImportModal && (
          <button
            type="button"
            onClick={onOpenImportModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl font-semibold transition-colors cursor-pointer text-xs shrink-0"
          >
            <UploadCloud className="w-3.5 h-3.5 text-emerald-700" />
            <span>Upload (CSV/Excel)</span>
          </button>
        )}
      </div>

      {/* Prompt input card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <label htmlFor="prompt-input" className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Conversational Prompt</span>
          </label>
          <span className="text-xs text-slate-500 font-medium">Groq Cloud LLM</span>
        </div>

        <div className="relative">
          <textarea
            id="prompt-input"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Generate a non-GST invoice for Aaditi Raut for ₹2,500 for one promotional video on 29 Oct 2026, discount ₹200."
            className="w-full text-sm rounded-xl border border-slate-300 p-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-slate-900 placeholder:text-slate-400"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                handleGenerate();
              }
            }}
          />
        </div>

        {/* Quick Example Prompt Chips */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Quick Examples:
          </span>
          <div className="flex flex-col gap-1.5">
            {SAMPLE_PROMPTS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setPrompt(sample);
                  handleGenerate(sample);
                }}
                disabled={isLoading}
                className="text-left text-xs bg-slate-50 hover:bg-emerald-50/80 hover:text-emerald-900 border border-slate-200 hover:border-emerald-200 rounded-lg p-2 transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50"
              >
                <span className="truncate pr-2 text-slate-700 group-hover:text-emerald-900">
                  &ldquo;{sample}&rdquo;
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}
          </div>
        </div>

        {/* Submit button */}
        <button
          type="button"
          onClick={() => handleGenerate()}
          disabled={isLoading || !prompt.trim()}
          className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Parsing Prompt & Matching Database...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate with AI</span>
            </>
          )}
        </button>
      </div>

      {/* AI Bot Response Feedback Card */}
      {botReply && (
        <div className="bg-slate-900 text-slate-100 rounded-2xl p-4.5 shadow-md space-y-2 text-xs border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              AI Assistant Analysis
            </span>
            {currentInvoice.creatorMatched ? (
              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Matched Creator
              </span>
            ) : (
              <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" /> Missing Profile
              </span>
            )}
          </div>
          <p className="text-slate-300 leading-relaxed">{botReply}</p>
        </div>
      )}
    </div>
  );
}
