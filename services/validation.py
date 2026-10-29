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
