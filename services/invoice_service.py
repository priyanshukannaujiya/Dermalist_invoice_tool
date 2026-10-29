"""
Invoice orchestration service for AI Invoice Studio.
Coordinates calculations, creator lookups, Excel generation, PDF export,
and database persistence.
"""

import io
import os
import pandas as pd
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from services import database
from services.excel_service import ExcelService
from services.pdf_service import PDFService
from services.validation import calculate_invoice_totals, normalize_date, validate_invoice_payload


class InvoiceService:
    def __init__(self, excel_service: Optional[ExcelService] = None, pdf_service: Optional[PDFService] = None):
        self.excel_service = excel_service or ExcelService()
        self.pdf_service = pdf_service or PDFService()

    def prepare_invoice_draft(self, extracted: Dict[str, Any]) -> Dict[str, Any]:
        """
        Take LLM extracted data, look up creator in database,
        normalize date, calculate totals strictly with Python,
        and assign next sequential invoice number.
        """
        creator_name = extracted.get("creator_name", "")
        creator = None
        if creator_name:
            creator = database.find_creator_by_name(creator_name)

        # Date normalization
        raw_date = extracted.get("invoice_date")
        normalized_date = normalize_date(raw_date)

        # Calculate totals
        unit_price = float(extracted.get("unit_price") or 0.0)
        quantity = int(extracted.get("quantity") or 1)
        discount = float(extracted.get("discount") or 0.0)
        totals = calculate_invoice_totals(unit_price, quantity, discount)

        # Next sequential invoice number
        next_inv_no = database.get_next_invoice_number()

        draft = {
            "invoice_number": next_inv_no,
            "creator_id": creator["id"] if creator else None,
            "creator_name": creator["name"] if creator else creator_name,
            "creator_matched": creator is not None,
            "creator_profile": creator or {},
            "invoice_date": normalized_date,
            "service_description": extracted.get("service_description", "Promotional Video"),
            "quantity": totals["quantity"],
            "unit_price": totals["unit_price"],
            "taxable_value": totals["taxable_value"],
            "discount": totals["discount"],
            "subtotal_less_discount": totals["subtotal_less_discount"],
            "balance_due": totals["balance_due"],
            "video_link": extracted.get("video_link", ""),
            "status": "Generated",
        }
        return draft

    def generate_and_save_invoice(
        self,
        invoice_data: Dict[str, Any],
        creator_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Execute full generation flow:
        1. Validate payload and calculations
        2. Prevent duplicate invoice numbers
        3. Create Excel from template
        4. Create PDF with fallback
        5. Persist record in SQLite
        """
        is_valid, errors = validate_invoice_payload(invoice_data)
        if not is_valid:
            raise ValueError("; ".join(errors))

        inv_number = invoice_data["invoice_number"].strip()
        if database.check_invoice_number_exists(inv_number):
            raise ValueError(f"Invoice number '{inv_number}' already exists in database.")

        # Ensure creator_id is linked or create creator if needed
        creator_id = invoice_data.get("creator_id")
        if not creator_id:
            # Check if creator exists by name
            existing = database.find_creator_by_name(invoice_data["creator_name"])
            if existing:
                creator_id = existing["id"]
                creator_data = existing
            else:
                # Create a minimal creator profile
                new_creator_id = database.create_creator(
                    {
                        "name": invoice_data["creator_name"],
                        "address": creator_data.get("address", "Creator Address"),
                        "email": creator_data.get("email", ""),
                        "phone": creator_data.get("phone", ""),
                        "pan": creator_data.get("pan", ""),
                        "upi_id": creator_data.get("upi_id", ""),
                        "bank_account": creator_data.get("bank_account", ""),
                        "ifsc": creator_data.get("ifsc", ""),
                        "account_holder": creator_data.get("account_holder", invoice_data["creator_name"]),
                        "bank_name": creator_data.get("bank_name", ""),
                    }
                )
                creator_id = new_creator_id
                creator_data["id"] = new_creator_id

        invoice_data["creator_id"] = creator_id

        # 1. Generate Excel workbook
        excel_path = self.excel_service.generate_invoice_excel(
            invoice_data=invoice_data,
            creator_data=creator_data,
        )

        # 2. Generate PDF document
        pdf_path = self.pdf_service.generate_pdf(
            invoice_data=invoice_data,
            creator_data=creator_data,
            excel_path=excel_path,
        )

        invoice_data["excel_path"] = excel_path
        invoice_data["pdf_path"] = pdf_path

        # 3. Save into SQLite
        db_id = database.create_invoice(invoice_data)
        invoice_data["id"] = db_id

        return invoice_data

    @staticmethod
    def export_invoices_to_csv(invoices: List[Dict[str, Any]]) -> str:
        """Export list of invoice records to CSV string."""
        if not invoices:
            return ""

        export_cols = [
            "id",
            "invoice_number",
            "creator_name",
            "invoice_date",
            "service_description",
            "quantity",
            "unit_price",
            "taxable_value",
            "discount",
            "subtotal_less_discount",
            "balance_due",
            "status",
            "created_at",
        ]

        df = pd.DataFrame(invoices)
        available_cols = [c for c in export_cols if c in df.columns]
        df_export = df[available_cols]

        return df_export.to_csv(index=False)
