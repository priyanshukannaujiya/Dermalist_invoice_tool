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
Your role is to analyze conversational requests and extract the core billing details into a clean JSON object.

SECURITY / PRIVACY RULE:
Do NOT extract or store sensitive bank account credentials if they appear; focus on creator name, services rendered, and commercial amounts.

Required JSON Output Schema:
{
  "creatorName": string or null (full name of creator/influencer, e.g. "Aaditi Raut" or "Sneha Patil"),
  "date": string or null (invoice date mentioned or null, e.g. "29-10-2026" or "29 Oct 2026"),
  "description": string (service description, e.g. "One promotional video for Dermalist"),
  "taxableValue": number (numeric value in INR before discount, e.g. 2500),
  "discount": number (discount amount in INR if mentioned, default 0),
  "deliverableLink": string or null (URL or video link if provided),
  "quantity": number (default 1),
  "botReply": string (a short, polite, professional summary of what was understood and what was extracted)
}

Rules:
1. Parse rupee symbols (₹, Rs, INR, k/K e.g. 2.5k -> 2500, ₹2,500 -> 2500) accurately into numeric values.
2. If quantity is specified (e.g. "2 reels", "one video"), extract quantity as integer and adjust taxableValue if it is a total or per unit.
3. Respond ONLY with valid JSON.
`;

// Helper: Extract credentials locally on the server without sending them to Groq
function extractLocalCredentials(prompt: string) {
  const panMatch = prompt.match(/\b([A-Z]{5}[0-9]{4}[A-Z]{1})\b/i);
  const ifscMatch = prompt.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i);
  const upiMatch = prompt.match(/\b([a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9]{2,})\b/);
  const accMatch = prompt.match(/\b(\d{9,18})\b/);
  const phoneMatch = prompt.match(/(?:\+91[\s-]?)?([6-9]\d{9})\b/);
  const emailMatch = prompt.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);

  return {
    pan: panMatch ? panMatch[1].toUpperCase() : null,
    ifsc: ifscMatch ? ifscMatch[1].toUpperCase() : null,
    upi_id: upiMatch ? upiMatch[1] : null,
    bank_account: accMatch ? accMatch[1] : null,
    phone: phoneMatch ? phoneMatch[0] : null,
    email: emailMatch ? emailMatch[1] : null,
  };
}

export async function parseInvoiceWithGroq(prompt: string): Promise<ParsedInvoiceData> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured in the environment.");
  }

  // Extract any credentials locally first
  const localCreds = extractLocalCredentials(prompt);

  // Redact sensitive account numbers and PANs before calling Groq
  const sanitizedPrompt = prompt
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/gi, "[REDACTED_PAN]")
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, "[REDACTED_IFSC]")
    .replace(/\b\d{9,18}\b/g, "[REDACTED_ACCOUNT]")
    .replace(/\b[a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9]{2,}\b/g, "[REDACTED_UPI]");

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

  const creatorName = extracted.creatorName?.trim() || null;
  const taxableValue = Math.max(0, parseFloat(extracted.taxableValue) || 0);
  const discount = Math.max(0, parseFloat(extracted.discount) || 0);
  const quantity = Math.max(1, parseInt(extracted.quantity, 10) || 1);
  const unitPrice = quantity > 1 ? taxableValue / quantity : taxableValue;
  const subtotal = taxableValue;
  const balanceDue = Math.max(0, subtotal - discount);
  const deliverableLink = extracted.deliverableLink || null;
  const description = extracted.description?.trim() || "Promotional Video for Dermalist";
  const dateFormatted = formatDateDDMMYYYY(extracted.date);

  // Database lookup: match creator securely on server
  let matchedCreator: Creator | null = null;
  if (creatorName) {
    matchedCreator = await findCreatorByName(creatorName);
  }

  // Overlay any credentials extracted locally from prompt
  const finalCreator: Partial<Creator> = matchedCreator
    ? {
        id: matchedCreator.id,
        name: matchedCreator.name,
        address: matchedCreator.address || "",
        email: localCreds.email || matchedCreator.email || "",
        phone: localCreds.phone || matchedCreator.phone || "",
        pan: localCreds.pan || matchedCreator.pan || "",
        bank_name: matchedCreator.bank_name || "",
        bank_account: localCreds.bank_account || matchedCreator.bank_account || "",
        ifsc: localCreds.ifsc || matchedCreator.ifsc || "",
        account_holder: matchedCreator.account_holder || matchedCreator.name,
        upi_id: localCreds.upi_id || matchedCreator.upi_id || "",
        is_msme: matchedCreator.is_msme,
        msme_registration_no: matchedCreator.msme_registration_no,
      }
    : {
        name: creatorName || "",
        address: "",
        email: localCreds.email || "",
        phone: localCreds.phone || "",
        pan: localCreds.pan || "",
        bank_name: "",
        bank_account: localCreds.bank_account || "",
        ifsc: localCreds.ifsc || "",
        account_holder: creatorName || "",
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
  } else if (creatorName) {
    botReply = `Extracted details for "${creatorName}". No saved profile found in the Creator Directory. Please confirm their PAN, Bank Account, and IFSC to generate the invoice.`;
  } else {
    botReply = `Extracted invoice details for ₹${balanceDue.toLocaleString("en-IN")}. Please specify or select a creator to proceed.`;
  }

  return {
    creatorName: matchedCreator ? matchedCreator.name : creatorName,
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
