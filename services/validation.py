"""
Validation and data cleaning service for AI Invoice Studio.
Ensures calculations, dates, PAN, IFSC, and LLM extracted data are strictly valid.
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


PAN_REGEX = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", re.IGNORECASE)
IFSC_REGEX = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$", re.IGNORECASE)
EMAIL_REGEX = re.compile(r"^[\w\.-]+@[\w\.-]+\.\w+$")
UPI_REGEX = re.compile(r"^[\w\.\-]+@[\w\-]+$")


def validate_pan(pan: str) -> bool:
    """Validate Indian PAN format (5 letters, 4 digits, 1 letter)."""
    if not pan:
        return True  # Optional or pre-fill
    return bool(PAN_REGEX.match(pan.strip()))


def validate_ifsc(ifsc: str) -> bool:
    """Validate Indian IFSC code (4 letters, 0, 6 characters)."""
    if not ifsc:
        return True
    return bool(IFSC_REGEX.match(ifsc.strip()))


def validate_email(email: str) -> bool:
    """Validate standard email address."""
    if not email:
        return True
    return bool(EMAIL_REGEX.match(email.strip()))


def normalize_date(date_str: str) -> str:
    """
    Parse various natural language or standard date strings into DD-MM-YYYY.
    E.g. "29 October 2026", "2026-10-29", "29-10-2026", "29/10/2026".
    """
    if not date_str:
        return datetime.now().strftime("%d-%m-%Y")

    cleaned = date_str.strip()
    # List of possible formats
    formats = [
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y-%m-%d",
        "%d %B %Y",
        "%d %b %Y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%d %B, %Y",
        "%Y/%m/%d",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.strftime("%d-%m-%Y")
        except ValueError:
            continue

    # If already matches DD-MM-YYYY
    match = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", cleaned)
    if match:
        day, month, year = match.groups()
        return f"{int(day):02d}-{int(month):02d}-{year}"

    # Default fallback to today
    return datetime.now().strftime("%d-%m-%Y")


def calculate_invoice_totals(
    unit_price: float,
    quantity: int = 1,
    discount: float = 0.0,
) -> Dict[str, float]:
    """
    Calculate taxable_value, subtotal_less_discount, and balance_due.
    Calculations done purely in Python as required by security & reliability rules.
    """
    qty = max(1, int(quantity))
    price = max(0.0, float(unit_price))
    disc = max(0.0, float(discount))

    taxable_value = round(qty * price, 2)
    subtotal_less_discount = round(max(0.0, taxable_value - disc), 2)
    balance_due = subtotal_less_discount

    return {
        "quantity": qty,
        "unit_price": price,
        "taxable_value": taxable_value,
        "discount": disc,
        "subtotal_less_discount": subtotal_less_discount,
        "balance_due": balance_due,
    }


def validate_invoice_payload(payload: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Validate all fields before generating an invoice.
    Returns (is_valid, list_of_error_messages).
    """
    errors: List[str] = []

    if not payload.get("creator_id") and not payload.get("creator_name"):
        errors.append("Creator name or creator selection is required.")

    if not payload.get("service_description"):
        errors.append("Service description is required.")

    try:
        price = float(payload.get("unit_price", 0.0))
        if price <= 0:
            errors.append("Amount / Unit price must be greater than zero.")
    except (ValueError, TypeError):
        errors.append("Invalid amount specified.")

    try:
        disc = float(payload.get("discount", 0.0))
        if disc < 0:
            errors.append("Discount cannot be negative.")
        if "price" in locals() and disc > price:
            errors.append("Discount cannot exceed the total amount.")
    except (ValueError, TypeError):
        errors.append("Invalid discount value.")

    if not payload.get("invoice_number"):
        errors.append("Invoice number is required.")

    return len(errors) == 0, errors


def validate_creator_payload(data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Validate creator profile fields."""
    errors: List[str] = []

    if not data.get("name", "").strip():
        errors.append("Full Name is required.")

    if not data.get("address", "").strip():
        errors.append("Address is required.")

    pan = data.get("pan", "").strip()
    if pan and not validate_pan(pan):
        errors.append("PAN must be a valid 10-character code (e.g. ABCDE1234F).")

    ifsc = data.get("ifsc", "").strip()
    if ifsc and not validate_ifsc(ifsc):
        errors.append("IFSC code must be 11 characters (e.g. HDFC0000123).")

    email = data.get("email", "").strip()
    if email and not validate_email(email):
        errors.append("Email address is not in a valid format.")

    return len(errors) == 0, errors


# ==================== BULK INVOICE VALIDATION ====================

from typing import Optional as _Opt  # avoid re-importing at top level

try:
    from pydantic import BaseModel, field_validator, model_validator
    _PYDANTIC_AVAILABLE = True
except ImportError:
    _PYDANTIC_AVAILABLE = False


if _PYDANTIC_AVAILABLE:
    class BulkCreatorRecord(BaseModel):
        """Pydantic model for per-row validation of bulk invoice records."""
        creator_name: _Opt[str] = None
        address: _Opt[str] = None
        email: _Opt[str] = None
        phone: _Opt[str] = None
        pan: _Opt[str] = None
        upi_id: _Opt[str] = None
        bank_account: _Opt[str] = None
        ifsc: _Opt[str] = None
        account_holder: _Opt[str] = None
        bank_name: _Opt[str] = None
        invoice_date: _Opt[str] = None
        service_description: _Opt[str] = None
        quantity: int = 1
        unit_price: float = 0.0
        discount: float = 0.0
        video_link: _Opt[str] = None

        @field_validator("pan", mode="before")
        @classmethod
        def validate_pan_field(cls, v):
            if v and isinstance(v, str) and v.strip():
                if not PAN_REGEX.match(v.strip()):
                    raise ValueError(f"Invalid PAN format: '{v}'. Expected 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).")
                return v.strip().upper()
            return v

        @field_validator("ifsc", mode="before")
        @classmethod
        def validate_ifsc_field(cls, v):
            if v and isinstance(v, str) and v.strip():
                if not IFSC_REGEX.match(v.strip()):
                    raise ValueError(f"Invalid IFSC format: '{v}'. Expected 4 letters + 0 + 6 chars (e.g. HDFC0000123).")
                return v.strip().upper()
            return v

        @field_validator("email", mode="before")
        @classmethod
        def validate_email_field(cls, v):
            if v and isinstance(v, str) and v.strip():
                if not EMAIL_REGEX.match(v.strip()):
                    raise ValueError(f"Invalid email format: '{v}'.")
                return v.strip()
            return v

        @field_validator("quantity", mode="before")
        @classmethod
        def coerce_quantity(cls, v):
            try:
                return max(1, int(v))
            except (TypeError, ValueError):
                return 1

        @field_validator("unit_price", "discount", mode="before")
        @classmethod
        def coerce_float(cls, v):
            try:
                return max(0.0, float(v or 0.0))
            except (TypeError, ValueError):
                return 0.0


def validate_bulk_records(records: list) -> list:
    """
    Validate a list of extracted creator invoice records.
    Returns annotated list with per-record 'validation_errors' and 'is_valid' keys.
    Missing fields are flagged: name, price, service, PAN format, IFSC format.
    """
    annotated = []
    for i, rec in enumerate(records):
        errors = []
        field_flags = {}

        # Required field checks
        if not rec.get("creator_name"):
            errors.append("Creator name is missing.")
            field_flags["creator_name"] = "missing"

        unit_price = 0.0
        try:
            unit_price = float(rec.get("unit_price") or 0.0)
        except (TypeError, ValueError):
            pass
        if unit_price <= 0:
            errors.append("Invoice amount (unit_price) is missing or zero.")
            field_flags["unit_price"] = "missing"

        if not rec.get("service_description"):
            errors.append("Service description is missing.")
            field_flags["service_description"] = "missing"

        # Optional but validated when present
        pan = (rec.get("pan") or "").strip()
        if pan and not PAN_REGEX.match(pan):
            errors.append(f"Invalid PAN format: '{pan}'.")
            field_flags["pan"] = "invalid"

        ifsc = (rec.get("ifsc") or "").strip()
        if ifsc and not IFSC_REGEX.match(ifsc):
            errors.append(f"Invalid IFSC format: '{ifsc}'.")
            field_flags["ifsc"] = "invalid"

        email = (rec.get("email") or "").strip()
        if email and not EMAIL_REGEX.match(email):
            errors.append(f"Invalid email: '{email}'.")
            field_flags["email"] = "invalid"

        # Payment method check (warn, not block)
        has_payment = bool(
            (rec.get("bank_account") or "").strip()
            or (rec.get("upi_id") or "").strip()
        )
        warnings = []
        if not has_payment:
            field_flags["payment"] = "missing"
            warnings.append("Missing payment info (Bank A/C or UPI)")

        annotated.append({
            **rec,
            "row_index": i,
            "validation_errors": errors,
            "validation_warnings": warnings,
            "field_flags": field_flags,
            "is_valid": len(errors) == 0,
        })

    return annotated
