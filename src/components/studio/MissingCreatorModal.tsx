"use client";

import React, { useState } from "react";
import { CreatorProfile } from "@/types/invoice";
import { UserPlus, X, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { PAN_REGEX, IFSC_REGEX, IFSC_BANK_MAP, isValidBankName, resolveBankName } from "@/lib/utils";

interface MissingCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  creatorName: string;
  initialCreator?: Partial<CreatorProfile>;
  onSaveCreator: (creator: CreatorProfile) => void;
}

export function MissingCreatorModal({
  isOpen,
  onClose,
  creatorName,
  initialCreator,
  onSaveCreator,
}: MissingCreatorModalProps) {
  const [formData, setFormData] = useState<Partial<CreatorProfile>>({
    name: creatorName,
    address: "",
    email: "",
    phone: "",
    pan: "",
    bank_name: "",
    bank_account: "",
    ifsc: "",
    account_holder: creatorName,
    upi_id: "",
    is_msme: false,
    msme_registration_no: "",
  });

  React.useEffect(() => {
    if (isOpen) {
      setFormData({
        name: creatorName || initialCreator?.name || "",
        address: initialCreator?.address || "",
        email: initialCreator?.email || "",
        phone: initialCreator?.phone || "",
        pan: initialCreator?.pan || "",
        bank_name: resolveBankName(initialCreator?.bank_name, initialCreator?.ifsc),
        bank_account: initialCreator?.bank_account || "",
        ifsc: initialCreator?.ifsc || "",
        account_holder: initialCreator?.account_holder || creatorName || initialCreator?.name || "",
        upi_id: initialCreator?.upi_id || "",
        is_msme: initialCreator?.is_msme || false,
        msme_registration_no: initialCreator?.msme_registration_no || "",
      });
    }
  }, [isOpen, creatorName, initialCreator]);

  const [savingToDb, setSavingToDb] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (saveToDirectory: boolean) => {
    // Basic validation
    if (!formData.name?.trim()) {
      toast.error("Creator name is required.");
      return;
    }

    if (formData.pan && !PAN_REGEX.test(formData.pan.toUpperCase())) {
      toast.error("Invalid PAN format (e.g. ABCDE1234F).");
      return;
    }

    if (formData.ifsc && !IFSC_REGEX.test(formData.ifsc.toUpperCase())) {
      toast.error("Invalid IFSC format (e.g. HDFC0000123).");
      return;
    }

    try {
      setSavingToDb(true);
      let creatorId: number | null = null;

      const resolvedBank = resolveBankName(formData.bank_name, formData.ifsc);
      const submissionData = {
        ...formData,
        bank_name: resolvedBank,
      };

      if (saveToDirectory) {
        const res = await fetch("/api/creators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(submissionData),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to save creator in directory.");
        }

        const saved = await res.json();
        creatorId = saved.id;
        toast.success(`Saved ${formData.name} to Creator Directory!`);
      }

      onSaveCreator({
        ...submissionData,
        id: creatorId,
        name: formData.name!,
      } as CreatorProfile);

      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to process creator details.");
    } finally {
      setSavingToDb(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200/90 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-950 font-semibold text-sm">
            <UserPlus className="w-4 h-4 text-slate-700" />
            <span>Complete Creator Settlement Profile</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-md p-1 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
          <div className="leading-relaxed">
            Parsed creator <strong className="text-slate-900">&ldquo;{creatorName}&rdquo;</strong> is not yet registered in your directory. Enter their bank and tax credentials below to settle this invoice.
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="sm:col-span-2">
            <label className="font-semibold text-slate-700">Creator Name *</label>
            <input
              type="text"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700">PAN Number</label>
            <input
              type="text"
              placeholder="ABCDE1234F"
              value={formData.pan || ""}
              onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700">UPI ID</label>
            <input
              type="text"
              placeholder="name@okaxis"
              value={formData.upi_id || ""}
              onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700">Bank Account No</label>
            <input
              type="text"
              placeholder="50100234567890"
              value={formData.bank_account || ""}
              onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700">IFSC Code</label>
            <input
              type="text"
              placeholder="HDFC0000123"
              value={formData.ifsc || ""}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                const prefix = val.substring(0, 4);
                const inferredBank = IFSC_BANK_MAP[prefix];
                setFormData((prev) => ({
                  ...prev,
                  ifsc: val,
                  bank_name:
                    !prev.bank_name || !isValidBankName(prev.bank_name)
                      ? (inferredBank || "")
                      : prev.bank_name,
                }));
              }}
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700">Bank Name</label>
            <input
              type="text"
              placeholder="HDFC Bank"
              value={formData.bank_name || ""}
              onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700">Phone</label>
            <input
              type="text"
              placeholder="+91 98765 43210"
              value={formData.phone || ""}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="font-semibold text-slate-700">Address</label>
            <textarea
              rows={2}
              placeholder="Street, City, State, PIN"
              value={formData.address || ""}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={savingToDb}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Apply to invoice only
          </button>

          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={savingToDb}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save to Directory & Apply</span>
          </button>
        </div>
      </div>
    </div>
  );
}
