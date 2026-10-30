"use client";

import React, { useState, useEffect } from "react";
import { InvoiceDraft, CreatorProfile } from "@/types/invoice";
import { Search, UserCheck, Shield, Building, CreditCard, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface ManualInvoiceFormProps {
  invoice: InvoiceDraft;
  onChange: (updated: InvoiceDraft) => void;
}

export function ManualInvoiceForm({ invoice, onChange }: ManualInvoiceFormProps) {
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
        const res = await fetch(`/api/creators?limit=20&search=${encodeURIComponent(searchTerm)}`);
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
        bank_name: creator.bank_name || "",
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
    toast.success(`Selected ${creator.name} — profile details loaded!`);
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

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
      {/* 1. Creator Autocomplete Search */}
      <div className="space-y-1.5 relative">
        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <UserCheck className="w-4 h-4 text-emerald-600" />
          <span>Creator / Influencer Search</span>
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchTerm || invoice.creator?.name || ""}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowDropdown(true);
              handleCreatorFieldChange("name", e.target.value);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Type creator name to search directory..."
            className="w-full text-sm rounded-xl border border-slate-300 pl-9 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>

        {/* Dropdown list */}
        {showDropdown && creatorsList.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
            {creatorsList.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCreator(c)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50 text-xs border-b border-slate-100 last:border-b-0 flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-slate-900">{c.name}</span>
                  <span className="text-slate-500 ml-2">PAN: {c.pan || "N/A"}</span>
                </div>
                <span className="text-[11px] text-emerald-600 font-medium">Select</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Metadata: Invoice No & Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Invoice Number</label>
          <input
            type="text"
            value={invoice.invoice_number}
            onChange={(e) => handleFieldChange("invoice_number", e.target.value)}
            className="w-full text-sm font-mono rounded-xl border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Invoice Date (DD-MM-YYYY)</label>
          <input
            type="text"
            value={invoice.invoice_date}
            onChange={(e) => handleFieldChange("invoice_date", e.target.value)}
            className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* 3. Service Description & Link */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Service Description</label>
          <input
            type="text"
            value={invoice.service_description}
            onChange={(e) => handleFieldChange("service_description", e.target.value)}
            placeholder="e.g. One promotional video for Dermalist"
            className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Deliverable / Video Link (Optional)</label>
          <input
            type="text"
            value={invoice.video_link || ""}
            onChange={(e) => handleFieldChange("video_link", e.target.value)}
            placeholder="e.g. https://instagram.com/reel/..."
            className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* 4. Commercials: Taxable Value & Discount */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-600">Quantity</label>
          <input
            type="number"
            min={1}
            value={invoice.quantity}
            onChange={(e) => handleFieldChange("quantity", parseInt(e.target.value, 10) || 1)}
            className="w-full text-sm font-semibold rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-600">Taxable Value (₹)</label>
          <input
            type="number"
            value={invoice.taxable_value}
            onChange={(e) => handleFieldChange("taxable_value", parseFloat(e.target.value) || 0)}
            className="w-full text-sm font-semibold rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-600">Discount (₹)</label>
          <input
            type="number"
            value={invoice.discount}
            onChange={(e) => handleFieldChange("discount", parseFloat(e.target.value) || 0)}
            className="w-full text-sm font-semibold rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-emerald-800">Balance Due (₹)</label>
          <div className="text-sm font-bold text-emerald-700 py-1.5">
            ₹{invoice.balance_due.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* 5. MSME Registered toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/70">
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
          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
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
          <div className="mt-3 space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                  placeholder="username@okaxis"
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
                  onChange={(e) => handleCreatorFieldChange("ifsc", e.target.value.toUpperCase())}
                  placeholder="HDFC0000123"
                  className="w-full font-mono uppercase rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-xs"
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
