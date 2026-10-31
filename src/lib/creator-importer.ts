import Papa from "papaparse";
import * as XLSX from "xlsx";
import { PAN_REGEX, IFSC_REGEX, UDYAM_REGEX, resolveBankName } from "./utils";
import { Creator } from "./db";

export interface ParsedCreatorRow {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  pan?: string;
  bank_name?: string;
  bank_account?: string;
  ifsc?: string;
  account_holder?: string;
  upi_id?: string;
  is_msme?: boolean;
  msme_registration_no?: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  originalRowIndex: number;
}

export interface ImportSummary {
  totalRows: number;
  validRows: ParsedCreatorRow[];
  invalidRows: ParsedCreatorRow[];
  headersFound: string[];
}

/**
 * Common column header variations for flexible import mapping
 */
const FIELD_ALIASES: Record<string, string[]> = {
  name: [
    "name",
    "creator name",
    "creator_name",
    "creator",
    "influencer",
    "influencer name",
    "full name",
    "artist name",
    "vendor name",
    "name of creator",
    "name of the creator",
  ],
  address: [
    "address",
    "full address",
    "location",
    "creator address",
    "residential address",
    "street address",
    "address in details",
    "city",
    "state",
  ],
  email: [
    "email",
    "email id",
    "email_id",
    "email address",
    "creator email",
    "mail",
    "e-mail",
  ],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile number",
    "contact",
    "contact number",
    "contact no",
    "phone no",
    "mobile no",
  ],
  pan: [
    "pan",
    "pan number",
    "pan no",
    "pan card",
    "panno",
    "pan_number",
    "pan_no",
    "pan card no",
  ],
  bank_name: [
    "bank name",
    "bank",
    "name of bank",
    "bank_name",
    "bank title",
  ],
  bank_account: [
    "bank account",
    "bank account no",
    "bank account number",
    "account number",
    "account no",
    "account_number",
    "account_no",
    "a/c no",
    "a/c number",
    "ac no",
    "ac number",
    "bank a/c",
    "bank a/c no",
    "account",
  ],
  ifsc: [
    "ifsc",
    "ifsc code",
    "ifsc_code",
    "ifs code",
    "ifsc no",
  ],
  account_holder: [
    "account holder",
    "account holder name",
    "accountholder",
    "name of accountholder",
    "beneficiary name",
    "beneficiary",
    "holder name",
    "name on bank account",
    "account_holder",
  ],
  upi_id: [
    "upi",
    "upi id",
    "upi_id",
    "vpa",
    "upi address",
    "google pay",
    "phonepe",
  ],
  is_msme: [
    "is msme",
    "msme",
    "msme status",
    "msme registered",
    "msme (yes/no)",
    "is_msme",
    "msme registration status",
  ],
  msme_registration_no: [
    "msme registration no",
    "msme registration number",
    "msme no",
    "udyam",
    "udyam no",
    "udyam number",
    "udyam registration no",
    "udyam registration number",
    "msme_registration_no",
  ],
};

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function matchHeaderToField(header: string): string | null {
  const norm = normalizeHeader(header);
  if (!norm) return null;

  // 1. Exact match first across all aliases
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (norm === alias) {
        return field;
      }
    }
  }

  // 2. Match longer phrases first to prevent greedy sub-phrase collision
  // (e.g. "bank account number" -> bank_account, NOT bank_name or name)
  const allAliases: { field: string; alias: string }[] = [];
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      allAliases.push({ field, alias });
    }
  }

  allAliases.sort((a, b) => b.alias.length - a.alias.length);

  for (const item of allAliases) {
    if (norm.includes(item.alias)) {
      return item.field;
    }
  }

  return null;
}

export function cleanBankAccountString(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") {
    // Handle large integer account numbers from Excel without decimal notation
    return BigInt(Math.trunc(val)).toString();
  }
  return String(val)
    .replace(/[^0-9A-Za-z]/g, "")
    .trim();
}

export function cleanPanString(val: any): string {
  if (!val) return "";
  return String(val).toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

export function cleanIfscString(val: any): string {
  if (!val) return "";
  return String(val).toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

export function cleanMsmeBoolean(val: any): boolean {
  if (typeof val === "boolean") return val;
  if (!val) return false;
  const s = String(val).toLowerCase().trim();
  return ["yes", "y", "true", "1", "registered"].includes(s);
}

/**
 * Process a raw object row into a validated creator row
 */
export function normalizeRawRow(raw: Record<string, any>, rowIndex: number): ParsedCreatorRow {
  const mapped: Record<string, any> = {};
  for (const [key, val] of Object.entries(raw)) {
    const field = matchHeaderToField(key);
    if (field) {
      mapped[field] = val;
    }
  }

  const name = String(mapped.name || raw["name"] || raw["Creator"] || "").trim();
  const address = String(mapped.address || "").trim();
  const email = String(mapped.email || "").trim();
  const phone = String(mapped.phone || "").trim();
  const pan = cleanPanString(mapped.pan);
  const bank_account = cleanBankAccountString(mapped.bank_account);
  const ifsc = cleanIfscString(mapped.ifsc);
  const bank_name = resolveBankName(mapped.bank_name, ifsc);
  const account_holder = String(mapped.account_holder || "").trim() || name;
  const upi_id = String(mapped.upi_id || "").trim();
  const is_msme = cleanMsmeBoolean(mapped.is_msme);
  const msme_registration_no = String(mapped.msme_registration_no || "").trim().toUpperCase();

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!name) {
    errors.push("Creator name is missing");
  }

  if (pan && !PAN_REGEX.test(pan)) {
    warnings.push(`PAN "${pan}" does not follow standard 10-char format (e.g. ABCDE1234F)`);
  }

  if (ifsc && !IFSC_REGEX.test(ifsc)) {
    warnings.push(`IFSC "${ifsc}" does not follow standard 11-char format (e.g. HDFC0000123)`);
  }

  if (is_msme && msme_registration_no && !UDYAM_REGEX.test(msme_registration_no)) {
    warnings.push(`UDYAM No "${msme_registration_no}" does not follow standard format UDYAM-XX-00-0000000`);
  }

  if (!bank_account) {
    warnings.push("Bank account number is empty");
  }

  if (!ifsc) {
    warnings.push("Bank IFSC code is empty");
  }

  const isValid = errors.length === 0;

  return {
    name,
    address,
    email,
    phone,
    pan,
    bank_name,
    bank_account,
    ifsc,
    account_holder,
    upi_id,
    is_msme,
    msme_registration_no,
    isValid,
    errors,
    warnings,
    originalRowIndex: rowIndex,
  };
}

/**
 * Parse CSV text using PapaParse
 */
export function parseCreatorCsv(csvContent: string): ImportSummary {
  const result = Papa.parse<Record<string, any>>(csvContent, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields || [];
  const validRows: ParsedCreatorRow[] = [];
  const invalidRows: ParsedCreatorRow[] = [];

  result.data.forEach((row, idx) => {
    // Skip completely empty rows
    const hasValues = Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== "");
    if (!hasValues) return;

    const parsed = normalizeRawRow(row, idx + 1);
    if (parsed.isValid) {
      validRows.push(parsed);
    } else {
      invalidRows.push(parsed);
    }
  });

  return {
    totalRows: validRows.length + invalidRows.length,
    validRows,
    invalidRows,
    headersFound: headers,
  };
}

/**
 * Parse Excel Buffer or ArrayBuffer using SheetJS (xlsx)
 */
export function parseCreatorExcel(buffer: ArrayBuffer | Buffer): ImportSummary {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { totalRows: 0, validRows: [], invalidRows: [], headersFound: [] };
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: "",
    raw: false, // Convert cell values to formatted strings
  });

  const headers: string[] = [];
  if (rawRows.length > 0) {
    headers.push(...Object.keys(rawRows[0]));
  }

  const validRows: ParsedCreatorRow[] = [];
  const invalidRows: ParsedCreatorRow[] = [];

  rawRows.forEach((row, idx) => {
    const hasValues = Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== "");
    if (!hasValues) return;

    const parsed = normalizeRawRow(row, idx + 1);
    if (parsed.isValid) {
      validRows.push(parsed);
    } else {
      invalidRows.push(parsed);
    }
  });

  return {
    totalRows: validRows.length + invalidRows.length,
    validRows,
    invalidRows,
    headersFound: headers,
  };
}

/**
 * Sample creators template definition
 */
export const SAMPLE_CREATORS_TEMPLATE = [
  {
    "Creator Name": "Aaditi Abhijeet Raut",
    "Address": "Flat 402, Green Heights, Andheri West, Mumbai, Maharashtra 400053",
    "Email": "aaditi.raut@example.com",
    "Phone": "+91 98765 43210",
    "PAN Number": "ABCDE1234F",
    "Bank Name": "HDFC Bank",
    "Bank Account Number": "50100234567890",
    "IFSC Code": "HDFC0000123",
    "Account Holder Name": "Aaditi Abhijeet Raut",
    "UPI ID": "aaditi@okhdfcbank",
    "MSME Registered (YES/NO)": "NO",
    "MSME UDYAM Registration No": "",
  },
  {
    "Creator Name": "Rohan Sharma",
    "Address": "301, Palm Court, Sector 14, Gurgaon, Haryana 122001",
    "Email": "rohan.sharma@example.com",
    "Phone": "+91 91234 56789",
    "PAN Number": "BPZPS9876K",
    "Bank Name": "ICICI Bank",
    "Bank Account Number": "002301567890",
    "IFSC Code": "ICIC0000023",
    "Account Holder Name": "Rohan Sharma",
    "UPI ID": "rohansharma@icici",
    "MSME Registered (YES/NO)": "YES",
    "MSME UDYAM Registration No": "UDYAM-HR-04-0012345",
  },
  {
    "Creator Name": "Priya Venkat",
    "Address": "12, Indiranagar 100ft Road, Bangalore, Karnataka 560038",
    "Email": "priya.venkat@example.com",
    "Phone": "+91 99887 76655",
    "PAN Number": "ABCDE5678G",
    "Bank Name": "Axis Bank",
    "Bank Account Number": "912010045678901",
    "IFSC Code": "UTIB0000054",
    "Account Holder Name": "Priya Venkat",
    "UPI ID": "priyavenkat@axisbank",
    "MSME Registered (YES/NO)": "NO",
    "MSME UDYAM Registration No": "",
  },
];

/**
 * Generate a ready-to-download CSV template
 */
export function generateSampleCsv(): string {
  return Papa.unparse(SAMPLE_CREATORS_TEMPLATE);
}

/**
 * Generate a ready-to-download XLSX template buffer
 */
export function generateSampleXlsx(): Buffer {
  const ws = XLSX.utils.json_to_sheet(SAMPLE_CREATORS_TEMPLATE);

  // Set column widths for readability
  ws["!cols"] = [
    { wch: 24 }, // Name
    { wch: 38 }, // Address
    { wch: 25 }, // Email
    { wch: 18 }, // Phone
    { wch: 14 }, // PAN
    { wch: 18 }, // Bank Name
    { wch: 22 }, // Bank Account No
    { wch: 14 }, // IFSC
    { wch: 24 }, // Account Holder
    { wch: 22 }, // UPI
    { wch: 18 }, // MSME
    { wch: 24 }, // UDYAM
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Creators & Bank Details");
  const rawBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(rawBuf);
}
