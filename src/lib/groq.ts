import Groq from "groq-sdk";
import { findCreatorByName, Creator } from "./db";
import { formatDateDDMMYYYY } from "./utils";

export interface ParsedInvoiceData {
  creatorName: string | null;
  date: string;
  description: string;
  taxableValue: number;
  discount: number;
  deliverableLink: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  balanceDue: number;
  creatorMatched: boolean;
  requiresCreatorDetails: boolean;
  creator: Partial<Creator> | null;
  botReply: string;
}

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
];

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

export const KNOWN_BANKS = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Kotak Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Union Bank",
  "IndusInd Bank",
  "Yes Bank",
  "IDFC First Bank",
  "IDFC Bank",
  "Federal Bank",
  "Bank of India",
  "Indian Bank",
  "Indian Overseas Bank",
  "Bank of Maharashtra",
  "Central Bank of India",
  "UCO Bank",
  "Paytm Payments Bank",
  "Airtel Payments Bank",
];

export function extractBankName(prompt: string, ifsc?: string | null): string | null {
  if (!prompt) return null;

  // 1. Explicit keyword match (supports commas, newlines, voice dictation: "bank name HDFC Bank", "bank is State Bank of India", "in ICICI Bank", "bank: Axis Bank")
  const explicitMatch = prompt.match(
    /(?:^|\n|[,;]|\b)(?:bank(?:\s*name)?(?:\s*is)?|in\s*bank)\s*[:=-]?\s*([A-Za-z\s&]{2,35}?)(?=[,;\n\r]|(?:\b(?:a\/?c|account|acc|no|ifsc|code|pan|upi|phone|mobile|contact|for|dated|amount|₹|rs|balance)\b)|$)/i
  );
  if (explicitMatch && explicitMatch[1]?.trim()) {
    const candidate = explicitMatch[1].trim();
    const cleaned = candidate.replace(/\s+(?:account|a\/c|branch|no)$/i, "").trim();
    if (cleaned.length >= 2 && !/^(?:is|the|of|a|an|details?)$/i.test(cleaned)) {
      return cleaned;
    }
  }

  // 2. Check for known Indian bank names mentioned anywhere in prompt/voice
  for (const b of KNOWN_BANKS) {
    const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(prompt)) {
      return b;
    }
  }

  // Common bank abbreviations
  if (/\bSBI\b/i.test(prompt)) return "State Bank of India";
  if (/\bPNB\b/i.test(prompt)) return "Punjab National Bank";
  if (/\bBOB\b/i.test(prompt)) return "Bank of Baroda";
  if (/\bHDFC\b/i.test(prompt)) return "HDFC Bank";
  if (/\bICICI\b/i.test(prompt)) return "ICICI Bank";
  if (/\bKOTAK\b/i.test(prompt)) return "Kotak Mahindra Bank";
  if (/\bAXIS\b/i.test(prompt)) return "Axis Bank";

  // 3. Fallback: Auto-infer bank name from IFSC code prefix if IFSC is present
  if (ifsc && typeof ifsc === "string" && ifsc.length >= 4) {
    const prefix = ifsc.substring(0, 4).toUpperCase();
    if (IFSC_BANK_MAP[prefix]) {
      return IFSC_BANK_MAP[prefix];
    }
  }

  return null;
}

const SYSTEM_PROMPT = `
You are an expert AI Invoice Assistant specialized in extracting invoice details for Dermalist creator billings.
Your role is to analyze conversational requests or structured creator briefs (including speech/voice inputs) and extract the billing details into a clean JSON object.

SECURITY / PRIVACY RULE:
Do NOT extract or store sensitive bank account credentials if they appear; focus on creator name, billing address, bank name, services rendered, and commercial amounts.

Required JSON Output Schema:
{
  "creatorName": string or null (full name of creator/influencer, e.g. "Neha Patil", "Aaditi Raut", "Sneha Patil"),
  "creatorAddress": string or null (full billing address or residence if mentioned in the prompt, or null),
  "bankName": string or null (name of creator's bank if stated or spoken, e.g. "HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank", or null),
  "date": string or null (invoice date mentioned or null, e.g. "29-10-2026" or "29 Oct 2026"),
  "description": string (service description, e.g. "Promotional Video for Dermalist" or "Brand Collaboration Services"),
  "taxableValue": number (numeric value in INR before discount, e.g. 2500, default 0 if not mentioned),
  "discount": number (discount amount in INR if mentioned, default 0),
  "deliverableLink": string or null (URL or video link if provided),
  "quantity": number (default 1),
  "botReply": string (a short, polite, professional summary of what was understood and what was extracted)
}

Rules:
1. Parse rupee symbols (₹, Rs, INR, k/K e.g. 2.5k -> 2500, ₹2,500 -> 2500) accurately into numeric values.
2. If quantity is specified (e.g. "2 reels", "one video"), extract quantity as integer and adjust taxableValue if it is a total or per unit.
3. If no price is mentioned, set taxableValue to 0.
4. If bank name is mentioned in the voice or text (e.g. "bank is HDFC", "ICICI Bank", "SBI account"), extract bankName.
5. Respond ONLY with valid JSON.
`;

// Helper: Extract credentials locally on the server without sending them to Groq
function extractLocalCredentials(prompt: string) {
  const panMatch =
    prompt.match(/(?:^|\n|[,;]|\s)(?:pan(?:\s*number|\s*no\.?)?)\s*[:=-]?\s*([A-Z]{5}[0-9]{4}[A-Z]{1})\b/i) ||
    prompt.match(/\b([A-Z]{5}[0-9]{4}[A-Z]{1})\b/i);

  const ifscMatch =
    prompt.match(/(?:^|\n|[,;]|\s)(?:ifsc(?:\s*code)?)\s*[:=-]?\s*([A-Z]{4}0[A-Z0-9]{6})\b/i) ||
    prompt.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i);

  const emailMatch =
    prompt.match(/(?:^|\n|[,;]|\s)(?:email(?:\s*id)?|e-mail)\s*[:=-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
    prompt.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  const email = emailMatch ? emailMatch[1].trim() : null;

  const phoneLabeledMatch = prompt.match(
    /(?:^|\n|[,;]|\s)(?:contact(?:\s*number|\s*no\.?)?|phone(?:\s*number|\s*no\.?)?|mobile(?:\s*number|\s*no\.?)?|whatsapp)\s*[:=-]?\s*([+0-9\s-]{10,15})/i
  );
  const phoneGenericMatch = prompt.match(/(?:(?:\+91|0)[\s-]?)?([6-9]\d{9})\b/);
  const phone = phoneLabeledMatch
    ? phoneLabeledMatch[1].replace(/[^\d+]/g, "").trim()
    : phoneGenericMatch
    ? phoneGenericMatch[1]
    : null;

  const nameLineMatch = prompt.match(
    /(?:^|\n|[,;]|\s)(?:creator(?:\s*name)?|influencer|name|bill\s*to)\s*[:=-]\s*([^\n\r,]+)/i
  );
  const name = nameLineMatch ? nameLineMatch[1].trim() : null;

  const addrLineMatch = prompt.match(
    /(?:^|\n|[,;]|\s)(?:address|location|residence)\s*[:=-]\s*([^\n\r,]+)/i
  );
  const address = addrLineMatch ? addrLineMatch[1].trim() : null;

  const bank_name = extractBankName(prompt, ifscMatch ? ifscMatch[1] : null);

  // Bank account: require explicit account keyword or 11+ digits to avoid confusing with 10-digit phone numbers
  const accMatch = prompt.match(
    /(?:(?:bank\s*)?a\/?c(?:\s*no\.?|\s*number)?|account(?:\s*no\.?|\s*number)?|bank\s*account)\s*[:=-]?\s*(\d{9,18})\b/i
  );
  let bank_account = accMatch ? accMatch[1] : null;

  if (!bank_account) {
    const standaloneMatches = prompt.match(/\b(\d{11,18})\b/g);
    if (standaloneMatches) {
      for (const num of standaloneMatches) {
        if (phone && num.includes(phone)) continue;
        bank_account = num;
        break;
      }
    }
  }

  let upi_id: string | null = null;
  const upiExplicit = prompt.match(
    /(?:^|\n|[,;]|\s)(?:upi(?:\s*id)?|vpa)\s*[:=-]?\s*([a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9]{2,})\b/i
  );
  if (upiExplicit) {
    upi_id = upiExplicit[1].trim();
  } else {
    // Only capture as UPI if it is not an email domain (does not continue with .com, .in, etc.)
    const genericUpiMatches = prompt.match(/\b([a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9]{2,})\b/g);
    if (genericUpiMatches) {
      for (const m of genericUpiMatches) {
        if (email && email.startsWith(m)) continue;
        const afterIndex = prompt.indexOf(m) + m.length;
        if (prompt[afterIndex] === "." && /^\.[a-zA-Z]{2,}/.test(prompt.slice(afterIndex))) {
          continue;
        }
        upi_id = m;
        break;
      }
    }
  }

  return {
    name,
    address,
    pan: panMatch ? panMatch[1].toUpperCase() : null,
    ifsc: ifscMatch ? ifscMatch[1].toUpperCase() : null,
    upi_id,
    bank_account,
    bank_name,
    phone,
    email,
  };
}

export async function parseInvoiceWithGroq(prompt: string): Promise<ParsedInvoiceData> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured in the environment.");
  }

  // Extract any credentials and structured lines locally first
  const localCreds = extractLocalCredentials(prompt);

  // Redact ONLY sensitive account numbers and PANs before calling Groq
  let sanitizedPrompt = prompt;
  if (localCreds.pan) {
    sanitizedPrompt = sanitizedPrompt.replace(new RegExp(localCreds.pan, "gi"), "[REDACTED_PAN]");
  }
  if (localCreds.ifsc) {
    sanitizedPrompt = sanitizedPrompt.replace(new RegExp(localCreds.ifsc, "gi"), "[REDACTED_IFSC]");
  }
  if (localCreds.bank_account) {
    sanitizedPrompt = sanitizedPrompt.replace(new RegExp(localCreds.bank_account, "g"), "[REDACTED_ACCOUNT]");
  }
  if (localCreds.upi_id) {
    sanitizedPrompt = sanitizedPrompt.replace(new RegExp(localCreds.upi_id, "g"), "[REDACTED_UPI]");
  }

  const groq = new Groq({ apiKey });
  const configuredModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const modelsToTry = [configuredModel, ...FALLBACK_MODELS.filter((m) => m !== configuredModel)];

  let rawContent = "";
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: sanitizedPrompt },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      });

      rawContent = completion.choices[0]?.message?.content || "";
      if (rawContent) break;
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  if (!rawContent) {
    throw new Error(`Failed to get response from Groq models: ${lastError?.message || "Unknown error"}`);
  }

  // Parse JSON
  let extracted: any = {};
  try {
    extracted = JSON.parse(rawContent);
  } catch {
    const match = rawContent.match(/\{[\s\S]*\}/);
    if (match) {
      extracted = JSON.parse(match[0]);
    } else {
      throw new Error("Could not parse JSON response from LLM.");
    }
  }

  // Determine final creator name, address, and bank name (prefer explicit user-provided lines or LLM extraction)
  const finalCreatorName = localCreds.name || extracted.creatorName?.trim() || null;
  const finalAddress = localCreds.address || extracted.creatorAddress?.trim() || "";
  const finalBankName =
    localCreds.bank_name ||
    extracted.bankName?.trim() ||
    extractBankName(prompt, localCreds.ifsc) ||
    "";

  const taxableValue = Math.max(0, parseFloat(extracted.taxableValue) || 0);
  const discount = Math.max(0, parseFloat(extracted.discount) || 0);
  const quantity = Math.max(1, parseInt(extracted.quantity, 10) || 1);
  const unitPrice = quantity > 1 ? taxableValue / quantity : taxableValue;
  const subtotal = taxableValue;
  const balanceDue = Math.max(0, subtotal - discount);
  const deliverableLink = extracted.deliverableLink || null;
  const description =
    extracted.description?.trim() ||
    (taxableValue > 0 ? "Promotional Video for Dermalist" : "Creator Collaboration Services");
  const dateFormatted = formatDateDDMMYYYY(extracted.date);

  // Database lookup: match creator securely on server with strict word boundaries
  let matchedCreator: Creator | null = null;
  if (finalCreatorName) {
    matchedCreator = await findCreatorByName(finalCreatorName);
  }

  // Overlay any credentials extracted locally from prompt
  const finalCreator: Partial<Creator> = matchedCreator
    ? {
        id: matchedCreator.id,
        name: matchedCreator.name,
        address: finalAddress || matchedCreator.address || "",
        email: localCreds.email || matchedCreator.email || "",
        phone: localCreds.phone || matchedCreator.phone || "",
        pan: localCreds.pan || matchedCreator.pan || "",
        bank_name: finalBankName || matchedCreator.bank_name || "",
        bank_account: localCreds.bank_account || matchedCreator.bank_account || "",
        ifsc: localCreds.ifsc || matchedCreator.ifsc || "",
        account_holder: matchedCreator.account_holder || matchedCreator.name,
        upi_id: localCreds.upi_id || matchedCreator.upi_id || "",
        is_msme: matchedCreator.is_msme,
        msme_registration_no: matchedCreator.msme_registration_no,
      }
    : {
        name: finalCreatorName || "",
        address: finalAddress || "",
        email: localCreds.email || "",
        phone: localCreds.phone || "",
        pan: localCreds.pan || "",
        bank_name: finalBankName || "",
        bank_account: localCreds.bank_account || "",
        ifsc: localCreds.ifsc || "",
        account_holder: finalCreatorName || "",
        upi_id: localCreds.upi_id || "",
        is_msme: false,
        msme_registration_no: "",
      };

  // A profile is complete ONLY if it has creator name, PAN, bank account, and IFSC
  const hasCompleteBankDetails = Boolean(
    finalCreator.name?.trim() &&
    finalCreator.pan?.trim() &&
    finalCreator.bank_account?.trim() &&
    finalCreator.ifsc?.trim()
  );

  const creatorMatched = Boolean(matchedCreator && hasCompleteBankDetails);
  const requiresCreatorDetails = !hasCompleteBankDetails;

  let botReply = extracted.botReply || "";
  if (creatorMatched && matchedCreator) {
    botReply = `Found verified profile for ${matchedCreator.name}. Bank and tax credentials (${matchedCreator.bank_name || "Bank"}, PAN: ${matchedCreator.pan}) attached securely. Total balance due: ₹${balanceDue.toLocaleString("en-IN")}.`;
  } else if (matchedCreator && !hasCompleteBankDetails) {
    botReply = `Found profile for "${matchedCreator.name}", but banking credentials (PAN, Bank Account, or IFSC) are not complete. Please provide them to ensure the Excel invoice is fully populated.`;
  } else if (finalCreatorName) {
    botReply = `Extracted details for "${finalCreatorName}". No saved profile found in the Creator Directory. Please confirm their PAN, Bank Account, and IFSC to generate the invoice.`;
  } else {
    botReply = `Extracted invoice details for ₹${balanceDue.toLocaleString("en-IN")}. Please specify or select a creator to proceed.`;
  }

  return {
    creatorName: matchedCreator ? matchedCreator.name : finalCreatorName,
    date: dateFormatted,
    description,
    taxableValue,
    discount,
    deliverableLink,
    quantity,
    unitPrice,
    subtotal,
    balanceDue,
    creatorMatched,
    requiresCreatorDetails,
    creator: finalCreator,
    botReply,
  };
}
