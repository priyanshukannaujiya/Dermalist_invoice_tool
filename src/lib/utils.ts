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

export const IFSC_BANK_MAP: Record<string, string> = {
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  SBIN: "State Bank of India",
  UTIB: "Axis Bank",
  KKBK: "Kotak Mahindra Bank",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  UBIN: "Union Bank of India",
  INDB: "IndusInd Bank",
  YESB: "Yes Bank",
  IDFB: "IDFC First Bank",
  FDRL: "Federal Bank",
  BKID: "Bank of India",
  IDIB: "Indian Bank",
  IOBA: "Indian Overseas Bank",
  MAHB: "Bank of Maharashtra",
  PSIB: "Punjab & Sind Bank",
  CBIN: "Central Bank of India",
  UCBA: "UCO Bank",
  IBKL: "IDBI Bank",
  AUBL: "AU Small Finance Bank",
  RATN: "RBL Bank",
  BDBL: "Bandhan Bank",
  KVBL: "Karur Vysya Bank",
  CIUB: "City Union Bank",
  SIBL: "South Indian Bank",
  KARB: "Karnataka Bank",
  SCBL: "Standard Chartered Bank",
  HSBC: "HSBC Bank",
  CITI: "Citibank",
  DBSS: "DBS Bank",
  ESFB: "Equitas Small Finance Bank",
  UJVN: "Ujjivan Small Finance Bank",
  SRCX: "Saraswat Bank",
  COSB: "Cosmos Bank",
  TMBL: "Tamilnad Mercantile Bank",
  DLXB: "Dhanlaxmi Bank",
  CSBK: "CSB Bank",
  CORP: "Corporation Bank",
  ANDB: "Andhra Bank",
  ALLA: "Allahabad Bank",
  SYNB: "Syndicate Bank",
  VIJB: "Vijaya Bank",
  ORBC: "Oriental Bank of Commerce",
  PAYT: "Paytm Payments Bank",
  AIRP: "Airtel Payments Bank",
  IPOS: "India Post Payments Bank",
};

export function isValidBankName(name?: string | null): boolean {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  if (/^[&+\/\\:=-]/.test(trimmed)) return false;
  if (
    /^(?:&?\s*(?:payment|transfer|credentials?|details?|info|information|settlement|terms|method|mode|online|banking|account|a\/c|code|number|na|n\/a|none|null|nil|not\s*provided|not\s*available|unknown|to\s*be\s*provided))\s*$/i.test(
      trimmed
    )
  ) {
    return false;
  }
  if (/^(?:and|&)\s+payment/i.test(trimmed)) return false;
  return true;
}

export function canonicalizeBankName(name?: string | null): string {
  if (!name || typeof name !== "string") return "";
  let b = name.trim();
  if (/^SBI$/i.test(b)) return "State Bank of India";
  if (/^HDFC$/i.test(b)) return "HDFC Bank";
  if (/^ICICI$/i.test(b)) return "ICICI Bank";
  if (/^KOTAK$/i.test(b)) return "Kotak Mahindra Bank";
  if (/^AXIS$/i.test(b)) return "Axis Bank";
  if (/^PNB$/i.test(b)) return "Punjab National Bank";
  if (/^BOB$/i.test(b)) return "Bank of Baroda";
  if (/^IDBI$/i.test(b)) return "IDBI Bank";
  return b;
}

export function getBankNameFromIFSC(ifsc?: string | null): string | null {
  if (!ifsc || typeof ifsc !== "string") return null;
  const clean = ifsc.trim().toUpperCase();
  if (clean.length < 4) return null;
  const prefix = clean.substring(0, 4);
  return IFSC_BANK_MAP[prefix] || null;
}

export function resolveBankName(
  explicitBank?: string | null,
  ifsc?: string | null,
  fallback?: string | null
): string {
  const ifscInferred = getBankNameFromIFSC(ifsc);
  if (ifscInferred) {
    if (!explicitBank || !isValidBankName(explicitBank)) {
      return ifscInferred;
    }
    const canonical = canonicalizeBankName(explicitBank);
    return canonical || ifscInferred;
  }

  if (explicitBank && isValidBankName(explicitBank)) {
    return canonicalizeBankName(explicitBank);
  }

  if (fallback && isValidBankName(fallback)) {
    return canonicalizeBankName(fallback);
  }

  return "";
}
