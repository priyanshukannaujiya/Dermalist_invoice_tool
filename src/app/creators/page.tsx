"use client";

import React, { useState, useEffect } from "react";
import { Creator } from "@/lib/db";
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Building,
  CreditCard,
  ShieldCheck,
  X,
  Save,
  Loader2,
  AlertTriangle,
  UploadCloud,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { PAN_REGEX, IFSC_REGEX, UDYAM_REGEX, IFSC_BANK_MAP, isValidBankName, resolveBankName } from "@/lib/utils";
import { CreatorImportModal } from "@/components/creators/CreatorImportModal";

export default function CreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [revealedBanks, setRevealedBanks] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingCreator, setEditingCreator] = useState<Creator | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Creator>>({
    name: "",
    address: "",
    email: "",
    phone: "",
    pan: "",
    bank_name: "",
    bank_account: "",
    ifsc: "",
    account_holder: "",
    upi_id: "",
    is_msme: false,
    msme_registration_no: "",
  });

  const loadCreators = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/creators?search=${encodeURIComponent(searchTerm)}`);
      if (res.ok) {
        const data = await res.json();
        setCreators(data.creators || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      toast.error("Failed to load creator directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadCreators, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const toggleRevealBank = (id: number) => {
    setRevealedBanks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenAdd = () => {
    setEditingCreator(null);
    setFormData({
      name: "",
      address: "",
      email: "",
      phone: "",
      pan: "",
      bank_name: "",
      bank_account: "",
      ifsc: "",
      account_holder: "",
      upi_id: "",
      is_msme: false,
      msme_registration_no: "",
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (creator: Creator) => {
    setEditingCreator(creator);
    setFormData({
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
      is_msme: Boolean(creator.is_msme),
      msme_registration_no: creator.msme_registration_no || "",
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete creator "${name}"?`)) return;

    try {
      const res = await fetch(`/api/creators/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`Deleted creator "${name}".`);
        loadCreators();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete creator.");
      }
    } catch (err) {
      toast.error("Failed to delete creator.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      toast.error("Creator full name is required.");
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

    if (formData.is_msme && formData.msme_registration_no && !UDYAM_REGEX.test(formData.msme_registration_no)) {
      toast.error("Invalid UDYAM format. Must match UDYAM-XX-00-0000000.");
      return;
    }

    try {
      setSaving(true);
      const url = editingCreator ? `/api/creators/${editingCreator.id}` : "/api/creators";
      const method = editingCreator ? "PUT" : "POST";

      const resolvedBank = resolveBankName(formData.bank_name, formData.ifsc);
      const submission = { ...formData, bank_name: resolvedBank };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save creator.");
      }

      toast.success(
        editingCreator ? `Updated profile for ${formData.name}!` : `Created profile for ${formData.name}!`
      );
      setModalOpen(false);
      loadCreators();
    } catch (err: any) {
      toast.error(err.message || "Failed to save creator.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50/70 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1 font-mono">
              <span>Finance Ops</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-800 font-medium">Creator Directory</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
                Creator Directory
              </h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                {total} Records
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
              <span>Import Directory</span>
            </button>

            <button
              onClick={() => {
                window.open("/api/creators/export?format=xlsx", "_blank");
                toast.success("Downloading creators directory Excel...");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
              title="Export all creators to Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export XLSX</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium text-xs text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Creator</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-xs flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by creator name, PAN, bank name, IFSC..."
              className="w-full text-xs rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>

          <div className="text-xs text-slate-500 font-mono text-[11px]">
            Showing {creators.length} of {total}
          </div>
        </div>

        {/* Creators Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Creator Details</th>
                  <th className="py-3 px-4">PAN & MSME</th>
                  <th className="py-3 px-4">Bank Account & IFSC</th>
                  <th className="py-3 px-4">UPI & Contact</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                        <span>Loading creators from Neon PostgreSQL...</span>
                      </div>
                    </td>
                  </tr>
                ) : creators.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      No creators found matching &ldquo;{searchTerm}&rdquo;. Click &ldquo;Add New Creator&rdquo; to create one.
                    </td>
                  </tr>
                ) : (
                  creators.map((c) => {
                    const isRevealed = Boolean(revealedBanks[c.id]);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Creator Name & Address */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="font-bold text-slate-900 text-sm">{c.name}</div>
                          <div className="text-[11px] text-slate-500 line-clamp-2 max-w-xs mt-0.5">
                            {c.address || "No address provided"}
                          </div>
                        </td>

                        {/* PAN & MSME */}
                        <td className="py-3.5 px-4 align-top space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-medium text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                              {c.pan || "PAN N/A"}
                            </span>
                            {c.pan && (
                              <button
                                onClick={() => copyToClipboard(c.pan!, `pan-${c.id}`)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer"
                                title="Copy PAN"
                              >
                                {copiedId === `pan-${c.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>

                          {c.is_msme ? (
                            <div className="text-[10px] inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold border border-blue-200">
                              <ShieldCheck className="w-3 h-3" />
                              <span>{c.msme_registration_no || "MSME Verified"}</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">Non-MSME</div>
                          )}
                        </td>

                        {/* Bank Account & IFSC (Masked) */}
                        <td className="py-3.5 px-4 align-top space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-800 font-medium">
                              {c.bank_account ? (
                                isRevealed ? (
                                  c.bank_account
                                ) : (
                                  `•••• •••• ${c.bank_account.slice(-4)}`
                                )
                              ) : (
                                <span className="text-slate-400">A/C not on file</span>
                              )}
                            </span>
                            {c.bank_account && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => toggleRevealBank(c.id)}
                                  className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                  title={isRevealed ? "Mask" : "Reveal account"}
                                >
                                  {isRevealed ? (
                                    <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => copyToClipboard(c.bank_account!, `acc-${c.id}`)}
                                  className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                  title="Copy account number"
                                >
                                  {copiedId === `acc-${c.id}` ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <strong>IFSC:</strong> {c.ifsc || "—"} &bull; {c.bank_name || "Bank"}
                          </div>
                        </td>

                        {/* UPI & Contact */}
                        <td className="py-3.5 px-4 align-top space-y-0.5 text-slate-600">
                          <div>
                            <strong className="text-slate-700">UPI:</strong> {c.upi_id || "—"}
                          </div>
                          <div>
                            <strong className="text-slate-700">Phone:</strong> {c.phone || "—"}
                          </div>
                          <div>
                            <strong className="text-slate-700">Email:</strong> {c.email || "—"}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 align-top text-right space-x-1">
                          <button
                            onClick={() => handleOpenEdit(c)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
                            title="Edit Creator"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id, c.name)}
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Delete Creator"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Creator Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-display font-bold text-base">
                <Users className="w-5 h-5 text-emerald-600" />
                <span>{editingCreator ? `Edit Profile: ${editingCreator.name}` : "Add New Creator"}</span>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-semibold text-slate-700">Creator Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="e.g. Aaditi Abhijeet Raut"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700">PAN Number</label>
                  <input
                    type="text"
                    value={formData.pan || ""}
                    onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                    placeholder="ABCDE1234F"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700">UPI ID</label>
                  <input
                    type="text"
                    value={formData.upi_id || ""}
                    onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                    placeholder="name@okaxis"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700">Bank Account Number</label>
                  <input
                    type="text"
                    value={formData.bank_account || ""}
                    onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    placeholder="50100234567890"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700">IFSC Code</label>
                  <input
                    type="text"
                    value={formData.ifsc || ""}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      const prefix = val.substring(0, 4);
                      const inferred = IFSC_BANK_MAP[prefix];
                      setFormData((prev) => ({
                        ...prev,
                        ifsc: val,
                        bank_name:
                          !prev.bank_name || !isValidBankName(prev.bank_name)
                            ? (inferred || "")
                            : prev.bank_name,
                      }));
                    }}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                    placeholder="HDFC0000123"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700">Name of Bank</label>
                  <input
                    type="text"
                    value={formData.bank_name || ""}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                    placeholder="HDFC Bank"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700">Name of Accountholder</label>
                  <input
                    type="text"
                    value={formData.account_holder || ""}
                    onChange={(e) => setFormData({ ...formData, account_holder: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                    placeholder="Matches bank passbook"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700">Phone</label>
                  <input
                    type="text"
                    value={formData.phone || ""}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700">Email ID</label>
                  <input
                    type="email"
                    value={formData.email || ""}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                    placeholder="creator@example.com"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold text-slate-700">Detailed Billing Address</label>
                  <textarea
                    rows={2}
                    value={formData.address || ""}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    placeholder="Flat, Building, Street, City, State, PIN"
                  />
                </div>
              </div>

              {/* MSME registration section */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <div>
                      <div className="font-semibold text-slate-800">Is Registered MSME?</div>
                      <div className="text-[10px] text-slate-500">Enable if creator holds UDYAM registration</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.is_msme)}
                    onChange={(e) => setFormData({ ...formData, is_msme: e.target.checked })}
                    className="w-4 h-4 text-emerald-600"
                  />
                </div>

                {formData.is_msme && (
                  <div>
                    <label className="font-semibold text-slate-700">UDYAM Registration No</label>
                    <input
                      type="text"
                      value={formData.msme_registration_no || ""}
                      onChange={(e) => setFormData({ ...formData, msme_registration_no: e.target.value })}
                      placeholder="UDYAM-MH-18-0490710"
                      className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 transition-colors font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{editingCreator ? "Update Profile" : "Save to Directory"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV & Excel Import Modal */}
      <CreatorImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportSuccess={() => loadCreators()}
      />
    </div>
  );
}
