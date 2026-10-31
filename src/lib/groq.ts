import Groq from "groq-sdk";
import { findCreatorByName, Creator } from "./db";
import {
  formatDateDDMMYYYY,
  IFSC_BANK_MAP,
  isValidBankName,
  canonicalizeBankName,
  getBankNameFromIFSC,
  resolveBankName,
} from "./utils";
export { IFSC_BANK_MAP };

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
  "IDBI Bank",
  "Bandhan Bank",
  "RBL Bank",
  "AU Small Finance Bank",
  "South Indian Bank",
  "Karnataka Bank",
  "Karur Vysya Bank",
  "City Union Bank",
  "Tamilnad Mercantile Bank",
  "Standard Chartered Bank",
  "HSBC Bank",
  "Citibank",
  "DBS Bank",
  "Saraswat Bank",
  "Cosmos Bank",
  "Equitas Small Finance Bank",
  "Ujjivan Small Finance Bank",
  "Dhanlaxmi Bank",
  "CSB Bank",
  "Punjab & Sind Bank",
  "Paytm Payments Bank",
  "Airtel Payments Bank",
];

export function extractBankName(prompt: string, ifsc?: string | null): string | null {
  if (!prompt && !ifsc) return null;

  // 1. Authoritative check: if IFSC prefix matches known Indian bank, return it directly
  const fromIfsc = getBankNameFromIFSC(ifsc);
  if (fromIfsc) {
    return fromIfsc;
  }

  if (prompt) {
    // 2. Explicit keyword match with strict colon/separator requirement
    // Only matches "Bank Name: HDFC", "Name of Bank: ICICI", "Bank: Axis", "Bank is SBI"
    const explicitMatch = prompt.match(
      /(?:^|\n|[,;])\s*(?:(?:name\s*of\s*bank|bank\s*name)\s*[:=-]|bank\s*[:=-]|bank\s+is\s+)\s*([A-Za-z0-9\s&.]{2,40}?)(?=[,;\n\r]|(?:\b(?:a\/?c|account|acc|no|ifsc|code|pan|upi|phone|mobile|contact|for|dated|amount|₹|rs|balance)\b)|$)/i
    );

    if (explicitMatch && explicitMatch[1]?.trim()) {
      let candidate = explicitMatch[1].trim();
      candidate = candidate.replace(/\s+(?:account|a\/c|branch|no|details)$/i, "").trim();
      candidate = candidate.replace(/^[-:= ]+/, "").trim();
      if (isValidBankName(candidate)) {
        return canonicalizeBankName(candidate);
      }
    }

    // 3. Known banks mentioned explicitly anywhere in prompt/voice
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
    if (/\bIDBI\b/i.test(prompt)) return "IDBI Bank";
  }

  return null;
}

const SYSTEM_PROMPT = `
You are an expert AI Invoice Assistant specialized in extracting invoice details for Dermalist creator billings.
Your role is to analyze conversational requests or structured creator briefs (including speech/voice inputs) and extract the billing details into a clean JSON object.

Required JSON Output Schema:
{
  "creatorName": string or null (full name of creator/influencer, e.g. "Neha Patil", "Aaditi Raut", "Sneha Patil"),
  "creatorAddress": string or null (full complete billing address with house/flat, street, area, city, state, pin code),
  "bankName": string or null (name of creator's bank if stated or spoken, e.g. "HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank", "Bank of Baroda", or null),
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
4. Extract creatorName, full creatorAddress, and bankName:
   - For creatorAddress: Always preserve the full address (including apartment, street, area, city, state, pin code). Do not truncate at commas.
   - For bankName: Always extract the bank name if mentioned anywhere (e.g. "bank is HDFC", "ICICI Bank", "SBI", "Bank Details: Kotak Bank", "Bank: Axis Bank", etc.).
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

  const nameLineMatch =
    prompt.match(/(?:^|\n)\s*(?<!\b(?:bank|account|holder|user)\s*)(?:creator(?:\s*name)?|influencer|bill\s*to)\s*[:=-]?\s*([^\n\r]+)/i) ||
    prompt.match(/(?:^|\n|[,;]|\s)(?<!\b(?:bank|account|holder|user)\s*)(?:creator(?:\s*name)?|influencer|bill\s*to)\s*[:=-]\s*([^\n\r,]+)/i);
  let name = nameLineMatch ? nameLineMatch[1].trim() : null;
  if (name && (/\bbank\b/i.test(name) || /^(?:is|the|of|a|an|details?)$/i.test(name))) {
    name = null;
  }

  // Address: support full multi-comma addresses on a line or inline before next keyword
  const lineAddrMatch = prompt.match(
    /(?:^|\n)\s*(?:address|location|residence|residing\s*at)\s*[:=-]?\s*([^\n\r]+)/i
  );
  const inlineAddrMatch = prompt.match(
    /(?:^|\n|[,;]|\b)(?:address|location|residence|residing\s*at)\s*[:=-]?\s*([^\n\r]+?)(?=(?:\b(?:bank|a\/?c|account|acc|no|ifsc|code|pan|upi|phone|mobile|contact|for|dated|amount|₹|rs|balance)\b|[\n\r]|$))/i
  );
  const rawAddr = lineAddrMatch ? lineAddrMatch[1] : inlineAddrMatch ? inlineAddrMatch[1] : null;
  const address = rawAddr ? rawAddr.trim().replace(/[,;]+$/, "").trim() : null;

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

  // Determine final creator name
  let finalCreatorName = localCreds.name || extracted.creatorName?.trim() || null;
  if (finalCreatorName && /\bbank\b/i.test(finalCreatorName)) {
    if (extracted.creatorName && !/\bbank\b/i.test(extracted.creatorName)) {
      finalCreatorName = extracted.creatorName.trim();
    } else {
      finalCreatorName = null;
    }
  }

  // Address: Pick the longest and most complete address between local extraction and LLM extraction
  const regexAddr = (localCreds.address || "").trim();
  const llmAddr = (extracted.creatorAddress || "").trim();
  const finalAddress = regexAddr.length >= llmAddr.length ? regexAddr : llmAddr;

  // Bank Name: Combine regex extraction, LLM extraction, and IFSC code inference
  const regexBank = (localCreds.bank_name || "").trim();
  const llmBank = (extracted.bankName || "").trim();
  const ifscCode = localCreds.ifsc || (extracted as any).ifsc || null;

  const candidateBank = isValidBankName(regexBank)
    ? regexBank
    : isValidBankName(llmBank)
    ? llmBank
    : null;

  const finalBankName = resolveBankName(
    candidateBank,
    ifscCode,
    extractBankName(prompt, ifscCode)
  );

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
        bank_name: finalBankName || resolveBankName(matchedCreator.bank_name, matchedCreator.ifsc, "") || "",
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
