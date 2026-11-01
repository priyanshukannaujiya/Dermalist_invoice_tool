"""
Groq LLM Integration Service for AI Invoice Studio.
Extracts structured invoice information from conversational text.
Never sends sensitive bank or PAN details to the LLM.
"""

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from dotenv import load_dotenv

try:
    from groq import Groq
except ImportError:
    Groq = None

load_dotenv()

FALLBACK_MODELS = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
]

_CACHED_GROQ_CLIENT = None

BULK_SYSTEM_PROMPT = """
You are an expert AI Invoice Assistant for Dermalist creator billing.
The user will provide details for MULTIPLE creators in one message.
Your task is to extract each creator's invoice data into a JSON array.

Output ONLY a valid JSON object in this exact format:
{
  "records": [
    {
      "creator_name": string or null,
      "address": string or null,
      "email": string or null,
      "phone": string or null,
      "invoice_date": string or null,
      "service_description": string or null,
      "quantity": integer (default 1),
      "unit_price": float or null,
      "discount": float (default 0.0),
      "video_link": string or null,
      "is_complete": boolean,
      "missing_fields": list of strings,
      "bot_reply": string
    },
    ...
  ],
  "summary": string (brief overall summary of what was extracted)
}

Rules:
1. Extract ALL creators mentioned. Support 1–10 creators per message.
2. DO NOT invent names or prices not mentioned.
3. Parse rupee amounts: ₹2,500 → 2500, 2.5k → 2500, Rs 3000 → 3000.
4. DO NOT include PAN numbers, bank account numbers, IFSC codes, or UPI IDs in output. These are extracted locally on the server.
5. If quantity is mentioned (e.g. "2 reels"), parse as integer.
6. Mark is_complete=true only when creator_name, unit_price, and service_description are all present.
7. Output raw JSON only — no markdown, no explanation text.
"""

SYSTEM_PROMPT = """
You are an expert AI Invoice Assistant specialized in extracting invoice details for creators and influencers.
Your task is to analyze user prompts requesting invoice generation and extract the required fields into a clean JSON structure.

Required Output Format:
Return ONLY a valid JSON object with the following keys:
{
  "creator_name": string or null (full name of creator/freelancer),
  "address": string or null (full address if provided),
  "email": string or null (email address if provided),
  "phone": string or null (contact phone number if provided),
  "pan": string or null (PAN number if provided),
  "upi_id": string or null (UPI ID if provided),
  "bank_account": string or null (bank account number if provided),
  "ifsc": string or null (IFSC code if provided),
  "account_holder": string or null (name of accountholder if provided),
  "bank_name": string or null (bank name if provided),
  "invoice_date": string or null (e.g. "29 October 2026", "29-10-2026", or null if not stated),
  "service_description": string or null (description of service, e.g. "1 x Promotional Video for Dermalist"),
  "quantity": integer (default 1),
  "unit_price": float or null (base amount before discount in INR, numeric only),
  "discount": float (discount amount in INR, numeric only, default 0.0),
  "video_link": string or null (URL or video link if mentioned),
  "is_complete": boolean (true ONLY if creator_name, unit_price, and service_description are identified),
  "missing_fields": list of strings (e.g. ["amount", "creator_name"] for essential missing fields),
  "bot_reply": string (A friendly, professional conversational response summarizing what was understood or politely asking for missing fields)
}

Rules:
1. Do NOT invent prices or creator names if they are not mentioned in the prompt.
2. If creator banking/contact details (address, PAN, bank account, IFSC, UPI) are provided in the prompt, extract them accurately into their respective keys.
2. If rupee symbol ₹, 'Rs', 'INR', or 'k' is used (e.g. 2.5k -> 2500, ₹2,500 -> 2500), parse the numeric value.
3. If quantity is specified (e.g. 'one video', '2 reels'), parse quantity as integer.
4. Output raw JSON only, no markdown wrapping, or inside ```json ``` codeblock.
"""


class GroqService:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        global _CACHED_GROQ_CLIENT
        self.api_key = api_key or os.getenv("GROQ_API_KEY", "")
        self.primary_model = model or os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
        if self.api_key and Groq is not None:
            if _CACHED_GROQ_CLIENT is None:
                _CACHED_GROQ_CLIENT = Groq(api_key=self.api_key)
            self.client = _CACHED_GROQ_CLIENT
        else:
            self.client = None

    def parse_invoice_request(
        self, user_prompt: str, chat_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Parse conversational request and return structured invoice data.
        Falls back to other models if primary model is unavailable.
        """
        if not self.api_key or not self.client:
            return {
                "error": "Groq API Key is not configured. Please set GROQ_API_KEY in your .env file or Settings.",
                "is_complete": False,
                "missing_fields": ["groq_api_key"],
                "bot_reply": "⚠️ Groq API key is missing. Please add your key in the Settings page.",
            }

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Include recent conversation turns for context
        if chat_history:
            for msg in chat_history[-6:]:
                messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({"role": "user", "content": user_prompt})

        # Try models starting with primary, then fallback list
        models_to_try = [self.primary_model] + [m for m in FALLBACK_MODELS if m != self.primary_model]

        last_error = None
        for model_name in models_to_try:
            try:
                response = self.client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.1,
                    max_tokens=350,
                )
                raw_content = response.choices[0].message.content.strip()
                parsed = self._extract_json(raw_content)
                if parsed:
                    # Sanitize and validate types
                    return self._clean_llm_result(parsed)
            except Exception as e:
                last_error = e
                # If error is 404 model not found or rate limit, continue to next model
                continue

        # If all LLM calls failed, provide a graceful fallback response
        return {
            "error": f"Groq API Error: {str(last_error)}",
            "is_complete": False,
            "missing_fields": ["api_connection"],
            "bot_reply": f"Could not reach Groq model ({str(last_error)}). Please check your API key or model in Settings.",
        }

    def _extract_json(self, text: str) -> Optional[Dict[str, Any]]:
        """Extract and parse JSON block from LLM output."""
        # Remove code block syntax if present
        text = text.strip()
        if "```" in text:
            match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
            if match:
                text = match.group(1).strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to find { ... } substring
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1:
                try:
                    return json.loads(text[start : end + 1])
                except json.JSONDecodeError:
                    pass
        return None

    def _clean_llm_result(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize extracted values and verify completeness."""
        creator_name = raw.get("creator_name")
        if creator_name and isinstance(creator_name, str):
            creator_name = creator_name.strip()
        else:
            creator_name = None

        service_desc = raw.get("service_description")
        if service_desc and isinstance(service_desc, str):
            service_desc = service_desc.strip()
        else:
            service_desc = None

        invoice_date = raw.get("invoice_date")
        if invoice_date and isinstance(invoice_date, str):
            invoice_date = invoice_date.strip()
        else:
            invoice_date = None

        try:
            qty = int(raw.get("quantity", 1))
            qty = max(1, qty)
        except (ValueError, TypeError):
            qty = 1

        try:
            unit_price = float(raw.get("unit_price") or 0.0)
        except (ValueError, TypeError):
            unit_price = 0.0

        try:
            discount = float(raw.get("discount") or 0.0)
        except (ValueError, TypeError):
            discount = 0.0

        video_link = raw.get("video_link") or ""

        # Check missing fields
        missing = []
        if not creator_name:
            missing.append("creator_name")
        if unit_price <= 0:
            missing.append("unit_price")
        if not service_desc:
            missing.append("service_description")

        is_complete = len(missing) == 0

        # Construct bot reply if not provided or incomplete
        bot_reply = raw.get("bot_reply")
        if not bot_reply:
            if is_complete:
                bot_reply = (
                    f"I have prepared the invoice draft for **{creator_name}** for **₹{unit_price:,.2f}** "
                    f"({service_desc}). Please review the preview below before confirming generation."
                )
            else:
                missing_str = ", ".join(m.replace("_", " ") for m in missing)
                bot_reply = f"I've noted some details, but I still need: **{missing_str}**. Could you please provide them?"

        return {
            "creator_name": creator_name,
            "address": raw.get("address"),
            "email": raw.get("email"),
            "phone": raw.get("phone"),
            "pan": raw.get("pan"),
            "upi_id": raw.get("upi_id"),
            "bank_account": raw.get("bank_account"),
            "ifsc": raw.get("ifsc"),
            "account_holder": raw.get("account_holder"),
            "bank_name": raw.get("bank_name"),
            "invoice_date": invoice_date,
            "service_description": service_desc,
            "quantity": qty,
            "unit_price": unit_price,
            "discount": discount,
            "video_link": video_link,
            "is_complete": is_complete,
            "missing_fields": missing,
            "bot_reply": bot_reply,
        }

    @staticmethod
    def is_account_query(prompt: str) -> Tuple[bool, Optional[str]]:
        return is_account_query(prompt)

    @staticmethod
    def format_account_details_card(creator: Dict[str, Any]) -> str:
        return format_account_details_card(creator)

    def parse_bulk_invoice_request(
        self, user_prompt: str, chat_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Parse a prompt that may contain multiple creator invoice records.
        Returns {"records": [...], "summary": str} or {"error": str}.
        Sensitive fields (PAN, bank account, IFSC, UPI) are extracted locally
        from the raw prompt BEFORE sending to Groq and overlaid afterwards.
        """
        if not self.api_key or not self.client:
            return {
                "error": "Groq API Key is not configured.",
                "records": [],
                "summary": "",
            }

        # 1. Extract sensitive credentials locally — never sent to Groq
        local_creds_per_block = _extract_bulk_local_credentials(user_prompt)

        messages = [{"role": "system", "content": BULK_SYSTEM_PROMPT}]
        if chat_history:
            for msg in chat_history[-4:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_prompt})

        models_to_try = [self.primary_model] + [m for m in FALLBACK_MODELS if m != self.primary_model]
        last_error = None
        raw_content = ""

        for model_name in models_to_try:
            try:
                response = self.client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.1,
                    max_tokens=1500,
                )
                raw_content = response.choices[0].message.content.strip()
                if raw_content:
                    break
            except Exception as e:
                last_error = e
                continue

        if not raw_content:
            return {
                "error": f"Groq API Error: {str(last_error)}",
                "records": [],
                "summary": "Could not reach Groq model.",
            }

        parsed = self._extract_json(raw_content)
        if not parsed:
            return {"error": "Could not parse LLM response as JSON.", "records": [], "summary": ""}

        raw_records = parsed.get("records", [])
        if not isinstance(raw_records, list):
            raw_records = []

        # Locally extract credentials accurately aligned to each creator
        local_creds = _extract_credentials_for_records(user_prompt, raw_records)

        cleaned_records = []
        for i, rec in enumerate(raw_records):
            cleaned = self._clean_llm_result(rec)
            # Overlay locally extracted credentials for the i-th creator
            if i < len(local_creds):
                lc = local_creds[i]
                for field in ["pan", "bank_account", "ifsc", "upi_id"]:
                    if lc.get(field):
                        cleaned[field] = lc[field]
            cleaned_records.append(cleaned)

        return {
            "records": cleaned_records,
            "summary": parsed.get("summary", f"Extracted {len(cleaned_records)} creator invoice record(s)."),
        }


def is_account_query(prompt: str) -> Tuple[bool, Optional[str]]:
    """
    Check if the user is asking to fetch or view account/bank details of a user or creator.
    Returns (is_account_query, search_target).
    """
    lower = prompt.lower().strip()

    # Exclude if prompt contains amounts, deliverables, campaign info, or invoice commands
    # (e.g. pasted creator data with 'payment amount: ₹3,000' or 'video description' must generate invoice)
    has_amount = any(sym in lower for sym in ["₹", "rs", "inr", "payment amount", "amount:", "price:", "deliverable", "campaign"]) and any(c.isdigit() for c in lower)
    has_invoice_keyword = any(w in lower for w in ["invoice", "bill", "generate", "create", "make"])
    if has_amount:
        return False, None
    if has_invoice_keyword and any(c.isdigit() for c in lower):
        return False, None

    # Only treat as account query if prompt specifically requests fetching/viewing
    query_action_words = ["fetch", "show", "get", "view", "what is", "who is", "check", "find"]
    has_action_request = any(act in lower for act in query_action_words)

    account_indicators = [
        "details of user", "details of", "user details", "creator details",
        "account detail", "account details", "bank detail", "bank details",
        "banking detail", "banking info", "pan detail", "ifsc", "bank account",
        "account no", "account number", "account",
    ]

    matched_indicator = any(ind in lower for ind in account_indicators)
    if not (matched_indicator and has_action_request):
        return False, None

    # Try extracting target name or search term
    for phrase in [
        "fetch details of user account details",
        "fetch details of user account",
        "fetch details of user",
        "fetch details of",
        "fetch account details of",
        "fetch account details for",
        "show account details of",
        "show account details for",
        "get account details of",
        "get account details for",
        "get bank details of",
        "get bank details for",
        "show bank details of",
        "show bank details for",
        "account details of",
        "account details for",
        "bank details of",
        "bank details for",
        "details of user",
        "details of",
        "account details",
        "bank details",
        "user account details",
    ]:
        if phrase in lower:
            idx = lower.find(phrase) + len(phrase)
            candidate = prompt[idx:].strip(" :?.-_")
            if candidate:
                return True, candidate
            return True, None

    return True, None


def format_account_details_card(creator: Dict[str, Any]) -> str:
    """Format creator profile and bank account details into a clean markdown card."""
    bank_acc = creator.get("bank_account") or "Not registered"
    ifsc = creator.get("ifsc") or "Not registered"
    holder = creator.get("account_holder") or creator.get("name") or "N/A"
    bank_name = creator.get("bank_name") or "Not specified"
    upi = creator.get("upi_id") or "Not registered"
    pan = creator.get("pan") or "Not registered"
    email = creator.get("email") or "Not provided"
    phone = creator.get("phone") or "Not provided"
    address = creator.get("address") or "Not provided"

    return (
        f"### 👤 Verified Account Details: **{creator['name']}**\n\n"
        f"- **Bank Name:** {bank_name}\n"
        f"- **Account Number:** `{bank_acc}`\n"
        f"- **Account Holder:** {holder}\n"
        f"- **IFSC Code:** `{ifsc}`\n"
        f"- **UPI ID:** `{upi}`\n"
        f"- **PAN Number:** `{pan}`\n"
        f"- **Contact:** {phone} | {email}\n"
        f"- **Address:** {address}\n\n"
        f"💡 *To generate an invoice for this creator, type:* `Generate invoice for {creator['name']} for ₹[amount] for [service]`"
    )


def _extract_single_local_credentials(block: str) -> Dict[str, Optional[str]]:
    """
    Extract sensitive fields (PAN, IFSC, bank account, UPI) from a single text block.
    These are NEVER sent to Groq/LLM.
    """
    # PAN: 5 uppercase letters, 4 digits, 1 uppercase letter
    pan_match = re.search(r'\b([A-Z]{5}[0-9]{4}[A-Z])\b', block, re.IGNORECASE)
    pan = pan_match.group(1).upper() if pan_match else None

    # IFSC: 4 letters, 0, 6 alphanumeric characters
    ifsc_match = re.search(
        r'(?:ifsc(?:\s*code)?)\s*[:\-=]?\s*([A-Z]{4}0[A-Z0-9]{6})\b|'
        r'\b([A-Z]{4}0[A-Z0-9]{6})\b',
        block, re.IGNORECASE
    )
    ifsc = None
    if ifsc_match:
        ifsc = (ifsc_match.group(1) or ifsc_match.group(2) or "").upper() or None

    # Bank account: labeled first, then 11–18 digit standalone
    acc_match = re.search(
        r'(?:bank\s*a[/]?c|account(?:\s*no)?|a[/]c\s*no)\s*[:\-=]?\s*(\d{9,18})\b',
        block, re.IGNORECASE
    )
    bank_account = acc_match.group(1) if acc_match else None
    if not bank_account:
        standalone = re.findall(r'\b(\d{11,18})\b', block)
        if standalone:
            bank_account = standalone[0]

    # UPI: explicit label first, then pattern
    upi_match = re.search(
        r'(?:upi\s*(?:id)?|vpa)\s*[:\-=]?\s*([\w.\-_]{2,}@[\w]{2,})\b',
        block, re.IGNORECASE
    )
    upi_id = upi_match.group(1) if upi_match else None
    if not upi_id:
        generic = re.search(r'\b([\w.\-_]{2,}@[\w]{2,})\b', block)
        if generic and '@' in generic.group(1):
            candidate = generic.group(1)
            # Not a standard email domain (avoids gmail.com etc.)
            after = block[block.find(candidate) + len(candidate):]
            if not re.match(r'^\.[a-zA-Z]{2,}', after):
                upi_id = candidate

    return {"pan": pan, "ifsc": ifsc, "bank_account": bank_account, "upi_id": upi_id}


def _extract_credentials_for_records(
    prompt: str, raw_records: List[Dict[str, Any]]
) -> List[Dict[str, Optional[str]]]:
    """
    Extract sensitive credentials (PAN, IFSC, bank account, UPI) locally per creator.
    These are NEVER sent to Groq/LLM.
    Uses precise name-based segmentation across the prompt so each creator receives
    their own credentials even if there are preamble or summary lines.
    """
    if not raw_records:
        return _extract_bulk_local_credentials(prompt)

    # 1. Locate each creator's appearance in the prompt
    positions = []
    for rec in raw_records:
        name = (rec.get("creator_name") or "").strip()
        pos = -1
        if name:
            m = re.search(re.escape(name), prompt, re.IGNORECASE)
            if not m:
                words = name.split()
                if words:
                    m = re.search(r'\b' + re.escape(words[0]) + r'\b', prompt, re.IGNORECASE)
            if m:
                pos = m.start()
        positions.append(pos)

    # If all positions are found and in ascending order, slice by segments
    valid_positions = [p for p in positions if p >= 0]
    if len(valid_positions) == len(raw_records) and sorted(valid_positions) == valid_positions:
        results = []
        for i, pos in enumerate(positions):
            start = pos
            end = positions[i + 1] if i + 1 < len(positions) else len(prompt)
            seg = prompt[start:end]
            results.append(_extract_single_local_credentials(seg))
        return results

    # 2. Fallback: block-based segmentation with preamble filtering
    return _extract_bulk_local_credentials(prompt)


def _extract_bulk_local_credentials(prompt: str) -> List[Dict[str, Optional[str]]]:
    """
    Split a multi-creator prompt into per-creator blocks and extract sensitive
    credentials from each block individually.
    Returns a list of credential dicts aligned to the order creators appear.
    """
    blocks = re.split(
        r'\n\s*[-—]{3,}\s*\n'       # --- or —— dividers
        r'|\n\s*\n\s*(?=\d+[\.\)])'  # blank line before numbered item
        r'|\n(?=\d+[\.\)]\s)'        # newline before numbered item
        r'|\n\s*\n(?=[A-Z][a-z]+\s+[A-Z])',  # blank line before capitalized name
        prompt
    )

    # Filter out preamble blocks without digits, currency or keywords
    clean_blocks = []
    for b in blocks:
        b_str = b.strip()
        if not b_str:
            continue
        has_content = bool(re.search(r'\d|₹|rs|pan|ifsc|upi|reel|video|inr', b_str, re.IGNORECASE))
        if has_content:
            clean_blocks.append(b_str)

    if not clean_blocks:
        return [_extract_single_local_credentials(prompt)]

    return [_extract_single_local_credentials(b) for b in clean_blocks]
