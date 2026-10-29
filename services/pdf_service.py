"""
PDF generation service for AI Invoice Studio.
Tries LibreOffice headless first if installed; gracefully falls back to
ReportLab for high-fidelity, independent PDF generation on any Windows system.
"""

import os
import shutil
import subprocess
from typing import Any, Dict, Optional

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class PDFService:
    def __init__(self, output_dir: str = "generated_invoices"):
        if not os.path.isabs(output_dir):
            self.output_dir = os.path.abspath(os.path.join(BASE_DIR, output_dir))
        else:
            self.output_dir = os.path.abspath(output_dir)
        os.makedirs(self.output_dir, exist_ok=True)
        self.libreoffice_path = self._find_libreoffice()

    def _find_libreoffice(self) -> Optional[str]:
        """Locate LibreOffice soffice executable on Windows or in PATH."""
        which_path = shutil.which("soffice") or shutil.which("libreoffice")
        if which_path:
            return which_path

        common_paths = [
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        ]
        for path in common_paths:
            if os.path.exists(path):
                return path

        return None

    def convert_excel_to_pdf(self, excel_path: str) -> Optional[str]:
        """Attempt conversion using LibreOffice headless if available."""
        if not self.libreoffice_path or not os.path.exists(excel_path):
            return None

        try:
            cmd = [
                self.libreoffice_path,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                self.output_dir,
                excel_path,
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
            if result.returncode == 0:
                base_name = os.path.splitext(os.path.basename(excel_path))[0]
                expected_pdf = os.path.join(self.output_dir, f"{base_name}.pdf")
                if os.path.exists(expected_pdf):
                    return os.path.abspath(expected_pdf)
        except Exception:
            pass  # Will fall back to ReportLab
        return None

    def generate_pdf(
        self,
        invoice_data: Dict[str, Any],
        creator_data: Dict[str, Any],
        excel_path: Optional[str] = None,
    ) -> str:
        """
        Generate PDF invoice.
        Uses LibreOffice headless if installed, otherwise uses ReportLab engine.
        Returns the absolute filepath of the generated PDF.
        """
        inv_num = invoice_data.get("invoice_number", "INV-001").replace("/", "_").replace("\\", "_")
        pdf_filename = f"Invoice_{inv_num}.pdf"
        target_pdf_path = os.path.abspath(os.path.join(self.output_dir, pdf_filename))

        # 1. Try LibreOffice if excel_path provided
        if excel_path and self.libreoffice_path:
            converted = self.convert_excel_to_pdf(excel_path)
            if converted and os.path.exists(converted):
                return converted

        # 2. ReportLab High-Fidelity Fallback
        self._generate_reportlab_pdf(target_pdf_path, invoice_data, creator_data)
        return target_pdf_path

    def _generate_reportlab_pdf(
        self,
        target_path: str,
        invoice_data: Dict[str, Any],
        creator_data: Dict[str, Any],
    ) -> None:
        """Render a clean, professional, matching PDF using ReportLab."""
        doc = SimpleDocTemplate(
            target_path,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36,
        )

        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            "DocTitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.HexColor("#1e293b"),
            alignment=1,  # Center
        )

        creator_name_style = ParagraphStyle(
            "CreatorName",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=colors.HexColor("#0f172a"),
        )

        body_style = ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#334155"),
        )

        bold_style = ParagraphStyle(
            "BoldBody",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#0f172a"),
        )

        header_label_style = ParagraphStyle(
            "HeaderLabel",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#1e3a8a"),
        )

        elements = []

        # Branded Header with Dermalist Logo
        logo_path = os.path.join(BASE_DIR, "assets", "logo.png")
        if not os.path.exists(logo_path):
            logo_path = os.path.abspath("assets/logo.png")
        if os.path.exists(logo_path):
            logo_img = RLImage(logo_path, width=2.1 * inch, height=0.48 * inch)
            header_table = Table(
                [[logo_img, Paragraph("INVOICE", title_style)]],
                colWidths=[2.2 * inch, 5.0 * inch],
            )
            header_table.setStyle(
                TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("ALIGN", (0, 0), (0, 0), "LEFT"),
                        ("ALIGN", (1, 0), (1, 0), "CENTER"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ]
                )
            )
            elements.append(header_table)
        else:
            elements.append(Paragraph("INVOICE", title_style))
        elements.append(Spacer(1, 14))

        # Creator details (left) & Invoice metadata (right)
        creator_name = creator_data.get("name", "Creator")
        creator_addr = creator_data.get("address", "")
        creator_email = creator_data.get("email", "")
        creator_phone = creator_data.get("phone", "")
        creator_pan = creator_data.get("pan", "")

        inv_number = invoice_data.get("invoice_number", "")
        inv_date = invoice_data.get("invoice_date", "")

        left_creator_info = [
            Paragraph(f"<b>{creator_name}</b>", creator_name_style),
            Paragraph(f"{creator_addr}", body_style),
            Paragraph(f"<b>Email:</b> {creator_email}", body_style),
            Paragraph(f"<b>Contact:</b> {creator_phone}", body_style),
            Paragraph(f"<b>PAN:</b> {creator_pan}", body_style),
        ]

        right_invoice_meta = [
            Paragraph(f"<b>Invoice No:</b> {inv_number}", bold_style),
            Paragraph(f"<b>Invoice Date:</b> {inv_date}", body_style),
            Paragraph("<b>Terms:</b> Bank Transfer or UPI", body_style),
            Paragraph("<b>MSME Reg. Status:</b> YES / NO", body_style),
            Paragraph("<b>MSME No:</b> UDYAM-MH-18-0490710", body_style),
        ]

        top_table_data = [
            [left_creator_info, right_invoice_meta],
        ]

        top_table = Table(top_table_data, colWidths=[3.8 * inch, 3.4 * inch])
        top_table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        elements.append(top_table)
        elements.append(Spacer(1, 10))

        # Bill To Box
        bill_to_data = [
            [
                Paragraph("<b>BILL TO:</b>", header_label_style),
            ],
            [
                Paragraph("<b>B M M RETAIL PRIVATE LIMITED</b>", bold_style),
            ],
            [
                Paragraph(
                    "THIRD, 307 A, FAIZ E QUTBI BUILDING,<br/>"
                    "PLOT NO 375, Narsi Natha Street,<br/>"
                    "Masjid Bander Maharashtra, 400009<br/>"
                    "<b>Contact:</b> 88509 80156 | <b>Email:</b> info@dermalist.in",
                    body_style,
                )
            ],
        ]
        bill_to_table = Table(bill_to_data, colWidths=[7.2 * inch])
        bill_to_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                    ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#cbd5e1")),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        elements.append(bill_to_table)
        elements.append(Spacer(1, 14))

        # Description and Amount Table
        description = invoice_data.get("service_description", "")
        qty = int(invoice_data.get("quantity", 1))
        unit_price = float(invoice_data.get("unit_price", 0.0))
        taxable_value = float(invoice_data.get("taxable_value", qty * unit_price))
        discount = float(invoice_data.get("discount", 0.0))
        subtotal_less_discount = float(invoice_data.get("subtotal_less_discount", max(0.0, taxable_value - discount)))
        balance_due = float(invoice_data.get("balance_due", subtotal_less_discount))
        video_link = invoice_data.get("video_link", "")

        desc_content = f"{description}"
        if qty > 1:
            desc_content = f"{qty} x {description}"
        if video_link:
            desc_content += f"<br/><font color='#2563eb'>Video Link: {video_link}</font>"

        items_data = [
            [
                Paragraph("<b>DESCRIPTION</b>", header_label_style),
                Paragraph("<b>TAXABLE VALUE (INR)</b>", header_label_style),
            ],
            [
                Paragraph(desc_content, body_style),
                Paragraph(f"INR {taxable_value:,.2f}", bold_style),
            ],
            [
                Paragraph("Thank you for your business!", body_style),
                Paragraph(f"<b>SUBTOTAL:</b> INR {taxable_value:,.2f}", body_style),
            ],
            [
                "",
                Paragraph(f"<b>DISCOUNT:</b> INR {discount:,.2f}", body_style),
            ],
            [
                "",
                Paragraph(f"<b>SUBTOTAL LESS DISCOUNT:</b> INR {subtotal_less_discount:,.2f}", body_style),
            ],
            [
                "",
                Paragraph(f"<b><font size='11' color='#1e3a8a'>BALANCE DUE: INR {balance_due:,.2f}</font></b>", bold_style),
            ],
        ]

        items_table = Table(items_data, colWidths=[4.7 * inch, 2.5 * inch])
        items_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                    ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#94a3b8")),
                    ("INNERGRID", (0, 0), (-1, 1), 0.5, colors.HexColor("#cbd5e1")),
                    ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#64748b")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("BACKGROUND", (1, 5), (1, 5), colors.HexColor("#eff6ff")),
                ]
            )
        )
        elements.append(items_table)
        elements.append(Spacer(1, 14))

        # Payment / Bank Details Table
        upi_id = creator_data.get("upi_id", "")
        bank_acc = creator_data.get("bank_account", "")
        ifsc = creator_data.get("ifsc", "")
        acc_holder = creator_data.get("account_holder", creator_name)
        bank_name = creator_data.get("bank_name", "")

        bank_data = [
            [
                Paragraph("<b>BANK & PAYMENT DETAILS</b>", header_label_style),
            ],
            [
                Paragraph(f"<b>UPI ID:</b> {upi_id}", body_style),
            ],
            [
                Paragraph(f"<b>Bank Account No:</b> {bank_acc}", body_style),
            ],
            [
                Paragraph(
                    f"<b>IFSC:</b> {ifsc} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                    f"<b>Account Holder:</b> {acc_holder} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                    f"<b>Bank:</b> {bank_name}",
                    body_style,
                )
            ],
        ]

        bank_table = Table(bank_data, colWidths=[7.2 * inch])
        bank_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                    ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#cbd5e1")),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        elements.append(bank_table)
        elements.append(Spacer(1, 10))

        # Non-GST Disclaimer Note
        disclaimer = Paragraph(
            "<font color='#64748b' size='8'><i>* This is a computer-generated Non-GST invoice. "
            "No goods and services tax (GST) is charged or collected. No physical signature required.</i></font>",
            body_style,
        )
        elements.append(disclaimer)

        doc.build(elements)
