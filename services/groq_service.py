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
from groq import Groq

load_dotenv()

FALLBACK_MODELS = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
]

_CACHED_GROQ_CLIENT = None

SYSTEM_PROMPT = """
You are an expert AI Invoice Assistant specialized in extracting invoice details for creators and influencers.
Your task is to analyze user prompts requesting invoice generation and extract the required fields into a clean JSON structure.

Required Output Format:
Return ONLY a valid JSON object with the following keys:
{
  "creator_name": string or null (full name of creator/freelancer),
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
2. If rupee symbol ₹, 'Rs', 'INR', or 'k' is used (e.g. 2.5k -> 2500, ₹2,500 -> 2500), parse the numeric value.
3. If quantity is specified (e.g. 'one video', '2 reels'), parse quantity as integer.
4. Output raw JSON only, no markdown wrapping, or inside ```json ``` codeblock.
"""


class GroqService:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        global _CACHED_GROQ_CLIENT
        self.api_key = api_key or os.getenv("GROQ_API_KEY", "")
        self.primary_model = model or os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
        if self.api_key:
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


def is_account_query(prompt: str) -> Tuple[bool, Optional[str]]:
    """
    Check if the user is asking to fetch or view account/bank details of a user or creator.
    Returns (is_account_query, search_target).
    """
    lower = prompt.lower().strip()

    # Exclude if prompt is an explicit invoice generation command with an amount
    if (
        ("generate" in lower or "create" in lower or "make" in lower)
        and ("invoice" in lower or "bill" in lower)
        and any(c.isdigit() for c in lower)
    ):
        return False, None

    account_indicators = [
        "account detail", "account details", "bank detail", "bank details",
        "fetch details of user", "fetch details of", "user details", "creator details",
        "show account", "get account", "banking detail", "banking info", "pan detail",
        "ifsc", "bank account", "account no", "account number", "who is",
    ]

    matched_indicator = any(ind in lower for ind in account_indicators)
    if not matched_indicator:
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
