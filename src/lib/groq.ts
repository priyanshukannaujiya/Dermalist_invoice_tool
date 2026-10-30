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

const SYSTEM_PROMPT = `
You are an expert AI Invoice Assistant specialized in extracting invoice details for Dermalist creator billings.
Your role is to analyze conversational requests or structured creator briefs and extract the billing details into a clean JSON object.

SECURITY / PRIVACY RULE:
Do NOT extract or store sensitive bank account credentials if they appear; focus on creator name, billing address, services rendered, and commercial amounts.

Required JSON Output Schema:
{
  "creatorName": string or null (full name of creator/influencer, e.g. "Neha Patil", "Aaditi Raut", "Sneha Patil"),
  "creatorAddress": string or null (full billing address or residence if mentioned in the prompt, or null),
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
4. Respond ONLY with valid JSON.
`;

// Helper: Extract credentials locally on the server without sending them to Groq
function extractLocalCredentials(prompt: string) {
  const panMatch =
    prompt.match(/(?:^|\n|\s)(?:pan(?:\s*number|\s*no\.?)?)\s*[:=-]?\s*([A-Z]{5}[0-9]{4}[A-Z]{1})\b/i) ||
    prompt.match(/\b([A-Z]{5}[0-9]{4}[A-Z]{1})\b/i);

  const ifscMatch =
    prompt.match(/(?:^|\n|\s)(?:ifsc(?:\s*code)?)\s*[:=-]?\s*([A-Z]{4}0[A-Z0-9]{6})\b/i) ||
    prompt.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i);

  const emailMatch =
    prompt.match(/(?:^|\n)\s*(?:email(?:\s*id)?|e-mail)\s*[:=-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
    prompt.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  const email = emailMatch ? emailMatch[1].trim() : null;

  const phoneLabeledMatch = prompt.match(
    /(?:^|\n)\s*(?:contact(?:\s*number|\s*no\.?)?|phone(?:\s*number|\s*no\.?)?|mobile(?:\s*number|\s*no\.?)?|whatsapp)\s*[:=-]?\s*([+0-9\s-]{10,15})/i
  );
  const phoneGenericMatch = prompt.match(/(?:(?:\+91|0)[\s-]?)?([6-9]\d{9})\b/);
  const phone = phoneLabeledMatch
    ? phoneLabeledMatch[1].replace(/[^\d+]/g, "").trim()
    : phoneGenericMatch
    ? phoneGenericMatch[1]
    : null;

  const nameLineMatch = prompt.match(
    /(?:^|\n)\s*(?:creator(?:\s*name)?|influencer|name|bill\s*to)\s*[:=-]\s*([^\n\r,]+)/i
  );
  const name = nameLineMatch ? nameLineMatch[1].trim() : null;

  const addrLineMatch = prompt.match(
    /(?:^|\n)\s*(?:address|location|residence)\s*[:=-]\s*([^\n\r]+)/i
  );
  const address = addrLineMatch ? addrLineMatch[1].trim() : null;

  const bankNameMatch = prompt.match(/(?:^|\n)\s*(?:bank(?:\s*name)?)\s*[:=-]\s*([^\n\r,]+)/i);
  const bank_name = bankNameMatch ? bankNameMatch[1].trim() : null;

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
    /(?:^|\n|\s)(?:upi(?:\s*id)?|vpa)\s*[:=-]?\s*([a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9]{2,})\b/i
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

  // Determine final creator name and address (prefer explicit user-provided lines)
  const finalCreatorName = localCreds.name || extracted.creatorName?.trim() || null;
  const finalAddress = localCreds.address || extracted.creatorAddress?.trim() || "";

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
        bank_name: localCreds.bank_name || matchedCreator.bank_name || "",
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
        bank_name: localCreds.bank_name || "",
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
