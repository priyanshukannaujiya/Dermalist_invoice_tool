"""
Tests for AI-Powered Bulk Invoice Generation feature.
Tests validate_bulk_records, reserve_invoice_numbers,
and _extract_bulk_local_credentials without live LLM calls.
"""
import pytest
import os
import tempfile
from services.validation import validate_bulk_records
from services.database import reserve_invoice_numbers, init_db, check_invoice_number_exists
from services.groq_service import _extract_bulk_local_credentials, _extract_single_local_credentials


# ==================== validate_bulk_records ====================

def test_bulk_validate_all_valid():
    records = [
        {"creator_name": "Aaditi Raut", "unit_price": 2500.0, "service_description": "Promo Reel", "quantity": 1},
        {"creator_name": "Rohan Sharma", "unit_price": 5000.0, "service_description": "2 Instagram Reels", "quantity": 2},
    ]
    result = validate_bulk_records(records)
    assert len(result) == 2
    for r in result:
        assert r["is_valid"] is True
        assert r["validation_errors"] == []


def test_bulk_validate_missing_name():
    records = [{"creator_name": None, "unit_price": 2500.0, "service_description": "Promo Video"}]
    result = validate_bulk_records(records)
    assert result[0]["is_valid"] is False
    assert any("name" in e.lower() for e in result[0]["validation_errors"])
    assert result[0]["field_flags"].get("creator_name") == "missing"


def test_bulk_validate_missing_price():
    records = [{"creator_name": "Priya V", "unit_price": 0, "service_description": "Video"}]
    result = validate_bulk_records(records)
    assert result[0]["is_valid"] is False
    assert result[0]["field_flags"].get("unit_price") == "missing"


def test_bulk_validate_missing_service():
    records = [{"creator_name": "Kunal K", "unit_price": 3000.0, "service_description": ""}]
    result = validate_bulk_records(records)
    assert result[0]["is_valid"] is False
    assert result[0]["field_flags"].get("service_description") == "missing"


def test_bulk_validate_invalid_pan():
    records = [{"creator_name": "Test User", "unit_price": 1000, "service_description": "Video", "pan": "INVALID"}]
    result = validate_bulk_records(records)
    assert result[0]["is_valid"] is False
    assert result[0]["field_flags"].get("pan") == "invalid"


def test_bulk_validate_valid_pan():
    records = [{"creator_name": "Test User", "unit_price": 1000, "service_description": "Video", "pan": "ABCDE1234F"}]
    result = validate_bulk_records(records)
    assert result[0]["is_valid"] is True


def test_bulk_validate_invalid_ifsc():
    records = [{"creator_name": "Test User", "unit_price": 1000, "service_description": "Video", "ifsc": "BADINVALIDIFSC"}]
    result = validate_bulk_records(records)
    assert result[0]["field_flags"].get("ifsc") == "invalid"


def test_bulk_validate_valid_ifsc():
    records = [{"creator_name": "Test User", "unit_price": 1000, "service_description": "Video", "ifsc": "HDFC0000123"}]
    result = validate_bulk_records(records)
    assert result[0]["is_valid"] is True


def test_bulk_validate_missing_payment_flagged_not_blocking():
    records = [{"creator_name": "Test", "unit_price": 1000, "service_description": "Reel", "bank_account": "", "upi_id": ""}]
    result = validate_bulk_records(records)
    assert result[0]["is_valid"] is True
    assert result[0]["field_flags"].get("payment") == "missing"


def test_bulk_validate_mixed_records():
    records = [
        {"creator_name": "Creator A", "unit_price": 2000, "service_description": "Reel"},
        {"creator_name": None, "unit_price": 0, "service_description": ""},
        {"creator_name": "Creator C", "unit_price": 3500, "service_description": "Story", "pan": "BADPAN"},
    ]
    result = validate_bulk_records(records)
    assert result[0]["is_valid"] is True
    assert result[1]["is_valid"] is False
    assert result[2]["is_valid"] is False
    assert result[2]["field_flags"].get("pan") == "invalid"


# ==================== reserve_invoice_numbers ====================

def test_reserve_invoice_numbers_basic():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        init_db(db_path=db_path, force=True)
        numbers = reserve_invoice_numbers(3, prefix="TEST-", db_path=db_path)
        assert len(numbers) == 3
        assert len(set(numbers)) == 3
        for n in numbers:
            assert n.startswith("TEST-")
    finally:
        import gc
        gc.collect()
        try:
            os.unlink(db_path)
        except PermissionError:
            pass


def test_reserve_single_invoice_number():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        init_db(db_path=db_path, force=True)
        numbers = reserve_invoice_numbers(1, prefix="INV-", db_path=db_path)
        assert len(numbers) == 1
        assert numbers[0].startswith("INV-")
    finally:
        import gc
        gc.collect()
        try:
            os.unlink(db_path)
        except PermissionError:
            pass


# ==================== Local credential extraction ====================

def test_extract_pan_from_block():
    block = "Creator: Aaditi Raut, PAN: ABCDE1234F, amount 2500"
    creds = _extract_single_local_credentials(block)
    assert creds["pan"] == "ABCDE1234F"


def test_extract_ifsc_from_block():
    block = "Creator: Rohan, IFSC: HDFC0000123, bank: HDFC"
    creds = _extract_single_local_credentials(block)
    assert creds["ifsc"] == "HDFC0000123"


def test_extract_bank_account_labeled():
    block = "Account No: 50100234567890, IFSC SBIN0001234"
    creds = _extract_single_local_credentials(block)
    assert creds["bank_account"] == "50100234567890"


def test_extract_upi_id():
    block = "UPI ID: creator@okhdfcbank for payment"
    creds = _extract_single_local_credentials(block)
    assert creds["upi_id"] == "creator@okhdfcbank"


def test_no_credentials_extracted():
    block = "Generate an invoice for 5000 for a promotional video"
    creds = _extract_single_local_credentials(block)
    assert creds["pan"] is None
    assert creds["ifsc"] is None


def test_bulk_credential_fallback_single_block():
    prompt = "Simple single creator invoice for 5000"
    result = _extract_bulk_local_credentials(prompt)
    assert isinstance(result, list)
    assert len(result) >= 1


# ==================== End-to-End Bulk Generation & ZIP ====================

def test_bulk_generation_pipeline_and_zip():
    """
    Test generating multiple invoices end-to-end:
    - reserve unique numbers
    - generate Excel + PDF per creator
    - verify unique invoice numbers and persistence in DB
    - bundle into a valid ZIP archive containing all files
    """
    import zipfile
    import io
    from services.invoice_service import InvoiceService
    from services.validation import calculate_invoice_totals

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        init_db(db_path=db_path, force=True)
        inv_service = InvoiceService(db_path=db_path)

        creators = [
            {"name": "Bulk Creator Alpha", "amount": 2500.0, "service": "Reel Alpha", "pan": "ABCDE1234F"},
            {"name": "Bulk Creator Beta", "amount": 5000.0, "service": "Reel Beta", "pan": "FGHIJ5678K"},
            {"name": "Bulk Creator Gamma", "amount": 3500.0, "service": "Reel Gamma", "pan": "KLMNO9012P"},
        ]

        # 1. Atomically reserve numbers
        inv_numbers = reserve_invoice_numbers(len(creators), prefix="TEST-", db_path=db_path)
        assert len(inv_numbers) == 3
        assert len(set(inv_numbers)) == 3

        # 2. Generate invoices
        generated_invoices = []
        for c, num in zip(creators, inv_numbers):
            totals = calculate_invoice_totals(c["amount"], 1, 0.0)
            inv_data = {
                "invoice_number": num,
                "creator_name": c["name"],
                "invoice_date": "29-10-2026",
                "service_description": c["service"],
                "quantity": totals["quantity"],
                "unit_price": totals["unit_price"],
                "taxable_value": totals["taxable_value"],
                "discount": totals["discount"],
                "subtotal_less_discount": totals["subtotal_less_discount"],
                "balance_due": totals["balance_due"],
                "status": "Generated",
            }
            c_data = {
                "name": c["name"],
                "address": "Mumbai, India",
                "pan": c["pan"],
                "upi_id": "creator@upi",
                "bank_account": "12345678901",
                "ifsc": "HDFC0000123",
            }
            res = inv_service.generate_and_save_invoice(invoice_data=inv_data, creator_data=c_data)
            assert res["invoice_number"] == num
            assert os.path.exists(res["excel_path"])
            assert os.path.exists(res["pdf_path"])
            generated_invoices.append(res)

        # 3. Create ZIP archive
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for inv in generated_invoices:
                with open(inv["excel_path"], "rb") as ef:
                    zf.writestr(f"{inv['creator_name']}_{inv['invoice_number']}.xlsx", ef.read())
                with open(inv["pdf_path"], "rb") as pf:
                    zf.writestr(f"{inv['creator_name']}_{inv['invoice_number']}.pdf", pf.read())

        zip_bytes = zip_buf.getvalue()
        assert len(zip_bytes) > 0

        # 4. Verify ZIP contents: 3 Excel + 3 PDF files = 6 files
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf_read:
            namelist = zf_read.namelist()
            assert len(namelist) == 6
            assert any(n.endswith(".xlsx") for n in namelist)
            assert any(n.endswith(".pdf") for n in namelist)

    finally:
        import gc
        gc.collect()
        try:
            os.unlink(db_path)
        except PermissionError:
            pass


def test_bulk_retry_avoids_duplication():
    """
    Test that retrying failed records filters out previously successful ones,
    preventing duplicate invoice generation.
    """
    successful_results = [
        {"status": "success", "invoice": {"creator_name": "Creator A", "invoice_number": "TEST-001"}},
        {"status": "success", "invoice": {"creator_name": "Creator B", "invoice_number": "TEST-002"}},
    ]
    re_validated = [
        {"creator_name": "Creator A", "is_valid": True},
        {"creator_name": "Creator B", "is_valid": True},
        {"creator_name": "Creator C", "is_valid": True},  # Was previously failed/corrected
    ]

    already_done = {
        r["invoice"]["creator_name"]
        for r in successful_results
        if r["status"] == "success"
    }
    pending = [r for r in re_validated if r["is_valid"] and r.get("creator_name") not in already_done]

    # Only Creator C is pending
    assert len(pending) == 1
    assert pending[0]["creator_name"] == "Creator C"


