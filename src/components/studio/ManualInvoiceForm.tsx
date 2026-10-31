"use client";

import React, { useState, useEffect } from "react";
import { InvoiceDraft, CreatorProfile } from "@/types/invoice";
import {
  Search,
  UserCheck,
  Shield,
  Building,
  CreditCard,
  ChevronDown,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { IFSC_BANK_MAP, isValidBankName, resolveBankName } from "@/lib/utils";

interface ManualInvoiceFormProps {
  invoice: InvoiceDraft;
  onChange: (updated: InvoiceDraft) => void;
  onOpenImportModal?: () => void;
}

export function ManualInvoiceForm({
  invoice,
  onChange,
  onOpenImportModal,
}: ManualInvoiceFormProps) {
  const [creatorsList, setCreatorsList] = useState<CreatorProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);

  // Fetch creators for autocomplete
  useEffect(() => {
    let active = true;
    const fetchCreators = async () => {
      try {
        setIsSearching(true);
        const res = await fetch(`/api/creators?limit=25&search=${encodeURIComponent(searchTerm)}`);
        if (res.ok && active) {
          const data = await res.json();
          setCreatorsList(data.creators || []);
        }
      } catch (err) {
        console.error("Error searching creators:", err);
      } finally {
        if (active) setIsSearching(false);
      }
    };

    const timer = setTimeout(fetchCreators, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const handleSelectCreator = (creator: CreatorProfile) => {
    onChange({
      ...invoice,
      creator: {
        id: creator.id,
        name: creator.name,
        address: creator.address || "",
        email: creator.email || "",
        phone: creator.phone || "",
        pan: creator.pan || "",
        bank_name: resolveBankName(creator.bank_name, creator.ifsc),
        bank_account: creator.bank_account || "",
        ifsc: creator.ifsc || "",
        account_holder: creator.account_holder || creator.name,
        upi_id: creator.upi_id || "",
        is_msme: creator.is_msme || false,
        msme_registration_no: creator.msme_registration_no || "",
      },
      creatorMatched: true,
    });
    setSearchTerm(creator.name);
    setShowDropdown(false);
    toast.success(`Selected ${creator.name} — profile & bank details loaded!`);
  };

  const handleFieldChange = (field: keyof InvoiceDraft, value: any) => {
    const updated = { ...invoice, [field]: value };

    // Recompute deterministic values
    if (field === "unit_price" || field === "quantity" || field === "taxable_value" || field === "discount") {
      const qty = field === "quantity" ? Number(value) : invoice.quantity;
      let taxable = invoice.taxable_value;

      if (field === "unit_price") {
        taxable = Number(value) * qty;
        updated.taxable_value = taxable;
      } else if (field === "quantity") {
        taxable = invoice.unit_price * qty;
        updated.taxable_value = taxable;
      } else if (field === "taxable_value") {
        taxable = Number(value);
        updated.unit_price = qty > 0 ? taxable / qty : taxable;
      }

      const disc = field === "discount" ? Number(value) : invoice.discount;
      updated.subtotal_less_discount = Math.max(0, taxable - disc);
      updated.balance_due = updated.subtotal_less_discount;
    }

    onChange(updated);
  };

  const handleCreatorFieldChange = (field: keyof CreatorProfile, value: any) => {
    onChange({
      ...invoice,
      creator: {
        ...invoice.creator,
        [field]: value,
      },
    });
  };

  const handleNameBlur = async () => {
    setTimeout(async () => {
      setShowDropdown(false);
      const typedName = (searchTerm || invoice.creator?.name || "").trim();
      if (!typedName) return;

      // Check if matches an existing creator in the fetched list
      const matched = creatorsList.find(
        (c) => c.name.toLowerCase() === typedName.toLowerCase()
      );
      if (matched && matched.id !== invoice.creator?.id) {
        handleSelectCreator(matched);
      }
    }, 250);
  };

  const c = invoice.creator || { name: "" };
  const hasBankDetails = Boolean(c.bank_account && c.ifsc);

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs space-y-4">
      {/* 1. Creator Autocomplete Search & Quick Import */}
      <div className="space-y-1.5 relative">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-slate-500" />
            <span>Payee Creator</span>
          </label>
          {onOpenImportModal && (
            <button
              type="button"
              onClick={onOpenImportModal}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <UploadCloud className="w-3 h-3" />
              <span>Import Directory</span>
            </button>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            value={searchTerm !== "" ? searchTerm : (invoice.creator?.name || "")}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowDropdown(true);
              handleCreatorFieldChange("name", e.target.value);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={handleNameBlur}
            placeholder="Type creator name to search directory..."
            className="w-full text-xs sm:text-sm rounded-lg border border-slate-200 pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-white"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>

        {/* Dropdown list */}
        {showDropdown && creatorsList.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto">
            {creatorsList.map((cr) => (
              <button
                key={cr.id}
                type="button"
                onMouseDown={() => handleSelectCreator(cr)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50 text-xs border-b border-slate-100 last:border-b-0 flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="font-semibold text-slate-900">{cr.name}</div>
                  <div className="text-slate-500 text-[11px] font-mono mt-0.5">
                    {cr.bank_name ? `${cr.bank_name} • ` : ""}
                    {cr.bank_account ? `A/C •••• ${cr.bank_account.slice(-4)}` : "A/C N/A"}
                    {cr.pan ? ` • PAN: ${cr.pan}` : ""}
                  </div>
                </div>
                <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Select
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Bank Credentials Summary Badge */}
        {c.name && (
          <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="text-[11px] text-slate-700">
                {hasBankDetails ? (
                  <span>
                    <strong>Bank:</strong> {c.bank_name || "Bank"} &bull;{" "}
                    <strong>A/C:</strong> {c.bank_account} &bull;{" "}
                    <strong>IFSC:</strong> {c.ifsc}
                  </span>
                ) : (
                  <span className="text-amber-700 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    Bank credentials incomplete for {c.name}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowBankDetails(!showBankDetails)}
              className="text-emerald-700 hover:text-emerald-800 font-semibold text-[11px] underline cursor-pointer shrink-0"
            >
              {showBankDetails ? "Hide" : "Edit"}
            </button>
          </div>
        )}
      </div>

      {/* 2. Metadata: Invoice No & Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700">Invoice Number</label>
          <input
            type="text"
            value={invoice.invoice_number}
            onChange={(e) => handleFieldChange("invoice_number", e.target.value)}
            className="w-full text-xs sm:text-sm font-mono rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700">Invoice Date (DD-MM-YYYY)</label>
          <input
            type="text"
            value={invoice.invoice_date}
            onChange={(e) => handleFieldChange("invoice_date", e.target.value)}
            placeholder="29-10-2026"
            className="w-full text-xs sm:text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white font-mono"
          />
        </div>
      </div>

      {/* 3. Deliverable / Video Description & Link */}
      <div className="space-y-2.5">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700">Service Description</label>
          <input
            type="text"
            value={invoice.service_description}
            onChange={(e) => handleFieldChange("service_description", e.target.value)}
            placeholder="1 x Promotional Video for Dermalist"
            className="w-full text-xs sm:text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700">Deliverable / Video Link</label>
          <input
            type="text"
            value={invoice.video_link || ""}
            onChange={(e) => handleFieldChange("video_link", e.target.value)}
            placeholder="https://www.instagram.com/reel/..."
            className="w-full text-xs sm:text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
          />
        </div>
      </div>

      {/* 4. Financials: Quantity, Price, Discount, Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50/80 p-3 rounded-lg border border-slate-200">
        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase text-slate-500">Qty</label>
          <input
            type="number"
            min={1}
            value={invoice.quantity}
            onChange={(e) => handleFieldChange("quantity", e.target.value)}
            className="w-full text-xs rounded-md border border-slate-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase text-slate-500">Taxable (₹)</label>
          <input
            type="number"
            value={invoice.taxable_value}
            onChange={(e) => handleFieldChange("taxable_value", e.target.value)}
            className="w-full text-xs rounded-md border border-slate-200 px-2 py-1.5 bg-white font-mono focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase text-slate-500">Discount (₹)</label>
          <input
            type="number"
            min={0}
            value={invoice.discount}
            onChange={(e) => handleFieldChange("discount", e.target.value)}
            className="w-full text-xs rounded-md border border-slate-200 px-2 py-1.5 bg-white font-mono focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase font-semibold text-slate-700">Due (₹)</label>
          <div className="w-full text-xs font-bold text-slate-950 bg-white border border-slate-200 rounded-md px-2 py-1.5 font-mono">
            ₹{invoice.balance_due.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* 5. MSME / UDYAM Registration */}
      <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-600" />
          <div>
            <div className="text-xs font-semibold text-slate-800">MSME / UDYAM Registration</div>
            <div className="text-[11px] text-slate-500">Enable if creator is registered MSME</div>
          </div>
        </div>
        <input
          type="checkbox"
          checked={Boolean(invoice.creator?.is_msme)}
          onChange={(e) => handleCreatorFieldChange("is_msme", e.target.checked)}
          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
        />
      </div>

      {invoice.creator?.is_msme && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">UDYAM Registration No</label>
          <input
            type="text"
            value={invoice.creator?.msme_registration_no || ""}
            onChange={(e) => handleCreatorFieldChange("msme_registration_no", e.target.value)}
            placeholder="UDYAM-MH-18-0490710"
            className="w-full text-sm font-mono rounded-xl border border-slate-300 px-3 py-2"
          />
        </div>
      )}

      {/* 6. Expandable Bank & Contact Overrides */}
      <div className="border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={() => setShowBankDetails(!showBankDetails)}
          className="flex items-center justify-between w-full text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-slate-500" />
            <span>Bank & Tax Credentials Override</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${showBankDetails ? "rotate-180" : ""}`}
          />
        </button>

        {showBankDetails && (
          <div className="mt-3 space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-medium text-slate-600">Bank Name</label>
                <input
                  type="text"
                  value={invoice.creator?.bank_name || ""}
                  onChange={(e) => handleCreatorFieldChange("bank_name", e.target.value)}
                  placeholder="HDFC Bank"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600">Account Holder Name</label>
                <input
                  type="text"
                  value={invoice.creator?.account_holder || ""}
                  onChange={(e) => handleCreatorFieldChange("account_holder", e.target.value)}
                  placeholder="Full Name as in Bank"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600">Bank Account No</label>
                <input
                  type="text"
                  value={invoice.creator?.bank_account || ""}
                  onChange={(e) => handleCreatorFieldChange("bank_account", e.target.value)}
                  placeholder="50100234567890"
                  className="w-full font-mono rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600">IFSC Code</label>
                <input
                  type="text"
                  value={invoice.creator?.ifsc || ""}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    const prefix = val.substring(0, 4);
                    const inferred = IFSC_BANK_MAP[prefix];
                    if ((!invoice.creator?.bank_name || !isValidBankName(invoice.creator?.bank_name)) && inferred) {
                      onChange({
                        ...invoice,
                        creator: {
                          ...(invoice.creator || { name: "" }),
                          ifsc: val,
                          bank_name: inferred,
                        },
                      });
                    } else {
                      handleCreatorFieldChange("ifsc", val);
                    }
                  }}
                  placeholder="HDFC0000123"
                  className="w-full font-mono uppercase rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600">PAN Number</label>
                <input
                  type="text"
                  value={invoice.creator?.pan || ""}
                  onChange={(e) => handleCreatorFieldChange("pan", e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  className="w-full font-mono uppercase rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600">UPI ID</label>
                <input
                  type="text"
                  value={invoice.creator?.upi_id || ""}
                  onChange={(e) => handleCreatorFieldChange("upi_id", e.target.value)}
                  placeholder="username@okhdfcbank"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-slate-600">Detailed Address</label>
                <textarea
                  rows={2}
                  value={invoice.creator?.address || ""}
                  onChange={(e) => handleCreatorFieldChange("address", e.target.value)}
                  placeholder="Street, City, State, PIN"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
