# AI Invoice Studio — Smart Non-GST Invoice Generator

[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.32+-FF4B4B?logo=streamlit&logoColor=white)](https://streamlit.io/)
[![Neon PostgreSQL](https://img.shields.io/badge/Database-Neon_PostgreSQL-00E599?logo=postgresql&logoColor=white)](https://neon.tech/)
[![Groq API](https://img.shields.io/badge/LLM-Groq_Fast_Inference-F05A28)](https://groq.com/)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

**AI Invoice Studio** is an enterprise-grade, conversational non-GST invoice generator built for **Dermalist** (`B M M RETAIL PRIVATE LIMITED`) to manage influencer billing (~100 invoices/month). It automates generating completed Excel workbooks directly from conversational instructions using the Groq API, renders matching PDFs, and persists creator and billing history in **Neon PostgreSQL** (with automatic local SQLite fallback).

---

## 🌟 Key Capabilities

1. **Conversational Invoicing (Groq API)**:
   - Natural language parsing (e.g., *"Generate a non-GST invoice for Aaditi Abhijeet Raut for ₹2,500 for one promotional video, dated 29 October 2026, with a discount of ₹200."*).
   - High-speed extraction with automatic model fallback (`openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`).
   - Strict separation of concerns: calculations and balance calculations are performed strictly in Python.

2. **Master Excel Template Fidelity**:
   - Master template: `templates/non gst invoice format - Dermalist (2).xlsx`.
   - 100% preservation of fonts (Roboto), borders, merged cells, formulas, and branding.
   - **Formula Correction**: Fixed template double-subtraction bug in cell `D32` (`=D31-D30` corrected to `=D31`).
   - Browser downloads are delivered with `.xlsx` extensions.

3. **Dual-Engine PDF Export**:
   - Automatically detects and utilizes **LibreOffice headless** if installed.
   - Gracefully falls back to high-fidelity **ReportLab** rendering with Dermalist branding.

4. **Resilient Neon PostgreSQL Database**:
   - Cloud-native persistence powered by **Neon PostgreSQL**.
   - Built-in connection retry and cold-start resilience.
   - Seamless automatic fallback to local SQLite (`data/invoice_studio.db`) if offline.

5. **Bank & PAN Data Privacy**:
   - Sensitive financial credentials (PAN, Bank Account, IFSC, UPI ID) are **never sent to the LLM**.
   - Retrieved securely from PostgreSQL/SQLite and directly mapped into the workbook.

---

## 📐 Template Cell Mapping

| Cell Coordinate | Field Description | Example Content / Formula |
| :--- | :--- | :--- |
| `B1` | Document Title | `INVOICE` |
| `B2:C2` (Merged) | Creator Full Name | `Aaditi Abhijeet Raut` |
| `B3:C3` (Merged) | Creator Detailed Address | `Flat 402, Sunshine Heights, Mumbai...` |
| `B5` | Creator Email | `Email ID: aaditi.raut@example.com` |
| `B6:C6` (Merged) | Creator Contact | `Contact Number: +91 98201 23456` |
| `B7` | Creator PAN | `Pan Number : ABCDE1234F` |
| `B9` | Bill-To Header | `BILL TO` |
| `B10:B15` | Company Billing Info | B M M Retail Private Limited details (Preserved) |
| `D9` | Invoice Number | `Invoice No: DL-001` |
| `D10` | Invoice Date | `Invoice Date:29-10-2026` |
| `D11` | Payment Terms | `Terms of Payment: Bank Transfer Or UPICode` |
| `D14` | MSME Status | `MSME Regsistration Status : YES / NO` |
| `D15` | MSME Number | `If Yes : MSME No :UDYAM-MH-18-0490710` |
| `B18:C18` (Merged) | Service Description | `One promotional video for Dermalist` |
| `D18` | Taxable Value | `2500.00` |
| `B20:C20` (Merged) | Optional Video Link | `Video Link- https://...` |
| `D29` | Subtotal Formula | `=SUM(D18:D28)` |
| `D30` | Discount Amount | `200.00` |
| `D31` | Subtotal Less Discount | `=D29-D30` |
| `D32` | Balance Due (Payable) | `=D31` *(Fixed template bug)* |
| `B32` | Creator UPI ID | `UPI ID : aaditi@okhdfcbank` |
| `B33` | Creator Bank Account | `Bank Account No:- 50100234567890` |
| `B34` | IFSC & Bank Info | `IFSC:- HDFC0000123  Name of Accountholder: ...` |

---

## 🚀 Quickstart & Deployment

### Option A: 1-Click Launch on Windows (Recommended)
Simply double-click `run.bat` or run:
```cmd
run.bat
```
This automatically initializes the virtual environment, verifies dependencies, checks `.env`, and launches the studio in your default browser at `http://localhost:8501`.

### Option B: 1-Click Launch on Linux / macOS
```bash
chmod +x run.sh
./run.sh
```

---

### Option C: Docker Deployment

#### Using Docker Compose:
```bash
docker compose up --build
```
Access the application at `http://localhost:8501`.

#### Using Docker CLI:
```bash
docker build -t dermalist-invoice-studio .
docker run -p 8501:8501 --env-file .env dermalist-invoice-studio
```

---

### Option D: Cloud Hosting (Render / Railway / Fly.io / Heroku)

The repository includes a ready-to-use `Procfile` and `Dockerfile`:
1. Push repository to GitHub.
2. In your cloud provider dashboard (e.g. Render, Railway, Fly.io), create a new **Web Service**.
3. Set Environment Variables:
   - `GROQ_API_KEY`: Your Groq API key.
   - `DATABASE_URL`: Your Neon PostgreSQL connection string.
4. Deploy! Health checks will automatically monitor `/_stcore/health`.

---

## ⚙️ Configuration Reference (`.env`)

```ini
# Groq API Configuration
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b

# Neon PostgreSQL Database (Falls back to SQLite if omitted)
DATABASE_URL=postgresql://neondb_owner:npg_...aws.neon.tech/neondb?sslmode=require
DB_PATH=data/invoice_studio.db

# Invoice Generator Settings
INVOICE_PREFIX=DL-
INVOICE_START_NUMBER=1
TEMPLATE_PATH=templates/non gst invoice format - Dermalist (2).xlsx
OUTPUT_DIR=generated_invoices
```

---

## 🧪 Automated Testing

Execute the complete test suite:
```bash
python -m pytest tests/ -v
```
All 11 tests validate:
- Accurate Non-GST calculations with discounts and quantities
- Collision-free sequential numbering (`DL-001`, `DL-002`)
- Duplicate invoice number prevention
- Natural language date normalization
- PAN and IFSC format validation
- Master template formatting & cell preservation
- High-fidelity PDF generation
- Decimal type sanitization
- Creator foreign key integrity
