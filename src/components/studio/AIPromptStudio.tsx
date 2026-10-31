"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  UploadCloud,
  Users,
  ChevronDown,
  Check,
  Mic,
  MicOff,
  Command,
  CornerDownLeft,
  Sparkles,
  Search,
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
  "Aaditi Raut: 1 promo reel for ₹2,500, Bank: HDFC Bank, Account: 50100234567890, IFSC: HDFC0000123",
  "Rohan Sharma: 2 reels for ₹5,000, Bank: State Bank of India, A/C: 987654321012, IFSC: SBIN0001234",
  "Priya Venkat: 1 deliverable ₹3,500, Bank: ICICI Bank, Account: 112233445566, IFSC: ICIC0000001",
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
  const [creatorSearch, setCreatorSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Voice dictation is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onstart = () => {
        setIsListening(true);
        toast.info("Microphone active: Dictate creator, bank details, or deliverables...");
      };

      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + " ";
        }
        setPrompt(transcript.trim());
      };

      recognition.onerror = (event: any) => {
        if (event.error !== "no-speech") {
          toast.error(`Voice input notice: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error("Speech recognition error:", err);
      toast.error("Microphone access could not be initialized.");
      setIsListening(false);
    }
  };

  useEffect(() => {
    fetch("/api/creators?limit=100")
      .then((res) => res.json())
      .then((data) => {
        if (data.creators) setCreatorsList(data.creators);
      })
      .catch((err) => console.error("Error fetching creators for prompt studio:", err));
  }, []);

  const handleSelectCreator = (c: CreatorProfile) => {
    if (onSelectCreator) {
      onSelectCreator(c);
      toast.success(`Attached verified bank credentials for ${c.name}`);
    }
    setShowPicker(false);
    if (!prompt.trim()) {
      setPrompt(`Generate invoice for ${c.name} for ₹2,500 for one promotional video.`);
    }
  };

  const handleGenerate = async (textToUse?: string) => {
    const text = (textToUse || prompt).trim();
    if (!text) {
      toast.error("Please enter invoice instructions or details.");
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
        throw new Error(err.error || "Failed to parse invoice.");
      }

      const data = await res.json();
      onParsed({ ...data, rawPrompt: text });
      toast.success(
        data.creatorMatched
          ? `Invoice parsed & matched with ${data.creatorName}'s file.`
          : `Invoice parsed for ${data.creatorName || "Creator"}. Please verify details.`
      );
    } catch (err: any) {
      toast.error(err.message || "Error communicating with parsing engine.");
    } finally {
      setIsLoading(false);
    }
  };

  const currentCreator = currentInvoice.creator;

  const filteredCreators = creatorsList.filter((c) =>
    c.name.toLowerCase().includes(creatorSearch.toLowerCase()) ||
    (c.bank_name && c.bank_name.toLowerCase().includes(creatorSearch.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Creator Quick Selector & Import Header */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>Target Creator</span>
          </div>
          {onOpenImportModal && (
            <button
              type="button"
              onClick={onOpenImportModal}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <UploadCloud className="w-3 h-3" />
              <span>Import CSV/Excel</span>
            </button>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className="w-full text-left bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between transition-colors cursor-pointer text-xs"
          >
            <div className="flex items-center gap-2 truncate">
              {currentCreator?.name ? (
                <>
                  <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    {currentCreator.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate text-slate-900 font-medium">{currentCreator.name}</span>
                  {currentCreator.bank_account && (
                    <span className="text-slate-500 text-[11px] font-mono shrink-0">
                      (•••• {currentCreator.bank_account.slice(-4)})
                    </span>
                  )}
                  {currentCreator.pan && (
                    <span className="text-[10px] font-mono text-slate-400 uppercase hidden sm:inline">
                      PAN: {currentCreator.pan}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-slate-500">Select verified creator from database ({creatorsList.length} available)...</span>
              )}
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${showPicker ? "rotate-180" : ""}`} />
          </button>

          {/* Searchable Dropdown */}
          {showPicker && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-64 overflow-hidden flex flex-col">
              <div className="p-2 border-b border-slate-100 bg-slate-50">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={creatorSearch}
                    onChange={(e) => setCreatorSearch(e.target.value)}
                    placeholder="Search creator by name or bank..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
                    autoFocus
                  />
                </div>
              </div>
              <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
                {filteredCreators.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No creators found matching &ldquo;{creatorSearch}&rdquo;
                  </div>
                ) : (
                  filteredCreators.map((c) => (
                    <button
                      key={c.id || c.name}
                      type="button"
                      onClick={() => handleSelectCreator(c)}
                      className="w-full text-left p-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between text-xs cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center text-[11px] font-semibold shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <div className="font-medium text-slate-900 truncate">
                            {c.name}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {c.bank_name ? `${c.bank_name} · ` : ""}
                            {c.bank_account ? `•••• ${c.bank_account.slice(-4)}` : "A/C Pending"}
                            {c.ifsc ? ` · ${c.ifsc}` : ""}
                          </div>
                        </div>
                      </div>
                      {currentCreator?.name === c.name && (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Parser Input Card */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-900">
              Natural Language Invoice Drafter
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              LLaMA 3.3
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleListening}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                isListening
                  ? "bg-red-600 text-white animate-pulse"
                  : "bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200"
              }`}
              title={isListening ? "Listening... click to stop" : "Speak invoice details using microphone"}
            >
              {isListening ? (
                <>
                  <MicOff className="w-3 h-3" />
                  <span>Listening</span>
                </>
              ) : (
                <>
                  <Mic className="w-3 h-3 text-slate-500" />
                  <span>Voice</span>
                </>
              )}
            </button>
          </div>
        </div>

        {isListening && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-2 text-xs text-red-700">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-ping shrink-0" />
            <span>
              <strong>Microphone Active:</strong> Speak creator name, bank details, deliverables, or fee...
            </span>
          </div>
        )}

        <div className="relative">
          <textarea
            id="prompt-input"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type or paste billing details: e.g. Bill Rohan Sharma ₹5,000 for 2 Instagram reels. Bank: HDFC Bank, Account: 50100234567890, IFSC: HDFC0000123"
            className="w-full text-xs sm:text-sm rounded-lg border border-slate-200 p-3 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors text-slate-900 placeholder:text-slate-400 font-sans leading-relaxed resize-none"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                handleGenerate();
              }
            }}
          />
          <div className="absolute right-2.5 bottom-2.5 hidden sm:flex items-center gap-1 text-[10px] text-slate-400 font-mono">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500">⌘</kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500">↵</kbd>
          </div>
        </div>

        {/* Quick Example Templates */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Quick Templates
          </span>
          <div className="flex flex-col gap-1">
            {SAMPLE_PROMPTS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setPrompt(sample);
                  handleGenerate(sample);
                }}
                disabled={isLoading}
                className="text-left text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-md px-2.5 py-1.5 transition-colors flex items-center justify-between group cursor-pointer disabled:opacity-50"
              >
                <span className="truncate pr-2 text-slate-600 font-sans group-hover:text-slate-900">
                  {sample}
                </span>
                <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-slate-700 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Execute Button */}
        <button
          type="button"
          onClick={() => handleGenerate()}
          disabled={isLoading || !prompt.trim()}
          className="w-full py-2.5 px-4 rounded-lg font-medium text-xs text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Parsing & Matching Database...</span>
            </>
          ) : (
            <>
              <span>Parse & Generate Invoice</span>
              <CornerDownLeft className="w-3 h-3 text-slate-400" />
            </>
          )}
        </button>
      </div>

      {/* Parser Audit Ledger / Inspection Response */}
      {botReply && (
        <div className="bg-slate-900 text-slate-100 rounded-xl p-3.5 shadow-sm space-y-2 text-xs border border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
              <span>Extraction Summary</span>
            </span>
            {currentInvoice.creatorMatched ? (
              <span className="text-[10px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Matched Directory
              </span>
            ) : (
              <span className="text-[10px] font-medium bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" /> Missing Profile
              </span>
            )}
          </div>
          <p className="text-slate-300 text-xs leading-relaxed font-sans">{botReply}</p>
        </div>
      )}

      {/* Privacy Safeguard notice */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 px-1">
        <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>Bank details, PAN & IFSC are merged securely on the server from PostgreSQL and never shared with public APIs.</span>
      </div>
    </div>
  );
}
