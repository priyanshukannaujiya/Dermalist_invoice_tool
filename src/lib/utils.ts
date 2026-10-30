import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyINR(amount: number | string | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  if (isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatDateDDMMYYYY(dateInput: string | Date | null | undefined): string {
  if (!dateInput) {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}-${m}-${y}`;
  }

  if (typeof dateInput === "string") {
    // If already DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateInput)) return dateInput;
    // If YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [y, m, d] = dateInput.split("-");
      return `${d}-${m}-${y}`;
    }
  }

  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    const today = new Date();
    return `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;
  }
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UDYAM_REGEX = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/;
