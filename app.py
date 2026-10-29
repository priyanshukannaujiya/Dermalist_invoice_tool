"""
AI Invoice Studio — Smart Invoice Generator
Main Streamlit Application
"""

import os
import io
import re
from datetime import datetime
import streamlit as st
import pandas as pd
from dotenv import load_dotenv

# Ensure backend services are imported
from services import database
from services.groq_service import GroqService
from services.excel_service import ExcelService
from services.pdf_service import PDFService
from services.invoice_service import InvoiceService
from services.validation import (
    calculate_invoice_totals,
    normalize_date,
    validate_creator_payload,
    validate_invoice_payload,
)

# Load environment configuration
load_dotenv()

# Page configuration
st.set_page_config(
    page_title="AI Invoice Studio — Smart Non-GST Invoice Generator",
    page_icon="🧾",
    layout="wide",
    initial_sidebar_state="expanded",
)

import base64
from PIL import Image

# Services initialization cached across reruns for lightning speed
@st.cache_resource
def get_services():
    database.init_db()
    excel = ExcelService()
    pdf = PDFService()
    inv = InvoiceService(excel_service=excel, pdf_service=pdf)
    groq = GroqService()
    return excel, pdf, inv, groq

excel_service, pdf_service, invoice_service, groq_service = get_services()

# Logo and Branding assets
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(BASE_DIR, "assets", "logo.png")
if not os.path.exists(LOGO_PATH):
    raw_candidates = [
        os.path.join(BASE_DIR, "Untitled_design_10 (1).webp"),
        os.path.join(BASE_DIR, "assets", "Untitled_design_10 (1).webp"),
        "Untitled_design_10 (1).webp",
        "assets/Untitled_design_10 (1).webp",
    ]
    for cand in raw_candidates:
        if os.path.exists(cand):
            os.makedirs(os.path.join(BASE_DIR, "assets"), exist_ok=True)
            try:
                Image.open(cand).save(LOGO_PATH, "PNG")
                break
            except Exception:
                pass

@st.cache_data
def get_template_bytes(template_path: str) -> bytes:
    if os.path.exists(template_path):
        with open(template_path, "rb") as f_tpl:
            return f_tpl.read()
    return b""

@st.cache_data(ttl=15)
def get_cached_dashboard_metrics():
    return database.get_dashboard_metrics()

def render_top_header(title: str, subtitle: str):
    """Render an executive branded header banner with prominent Dermalist logo."""
    c_logo, c_content = st.columns([2.2, 9.8])
    with c_logo:
        if os.path.exists(LOGO_PATH):
            st.image(LOGO_PATH, width=190)
    with c_content:
        st.markdown(
            f'<div style="display:flex; align-items:center; gap:8px;">'
            f'<span style="background-color:#dcfce7; color:#15803d; font-size:0.75rem; font-weight:700; padding:2px 10px; border-radius:9999px; letter-spacing:0.04em;">AI INVOICE STUDIO</span>'
            f'<span style="background-color:#eff6ff; color:#1d4ed8; font-size:0.75rem; font-weight:700; padding:2px 10px; border-radius:9999px;">NON-GST</span>'
            f'<span style="color:#94a3b8; font-size:0.75rem; font-weight:500;">B M M RETAIL PRIVATE LIMITED</span>'
            f'</div>'
            f'<h1 style="margin:4px 0 0 0; padding:0; font-size:1.85rem; font-weight:800; color:#0f172a; line-height:1.2; letter-spacing:-0.02em;">{title}</h1>'
            f'<div style="font-size:0.9rem; color:#64748b; margin-top:3px;">{subtitle}</div>',
            unsafe_allow_html=True,
        )
    st.markdown("<hr style='margin: 10px 0 20px 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)

def render_excel_download_button(file_path: str, filename: str):
    """Render a direct HTML5 download button that guarantees .xlsx file extension in browser."""
    if not file_path or not os.path.exists(file_path):
        st.warning("Excel file not available on disk.")
        return
    with open(file_path, "rb") as f:
        data_bytes = f.read()
    b64 = base64.b64encode(data_bytes).decode()
    html_btn = f"""
    <a href="data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,{b64}" 
       download="{filename}" 
       style="display: flex; align-items: center; justify-content: center; gap: 8px;
              width: 100%; padding: 12px 18px; background-color: #107c41; color: #ffffff !important; 
              text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 0.95rem;
              box-shadow: 0 2px 4px rgba(16, 124, 65, 0.25); border: 1px solid #0b5a2f; text-align: center; margin-bottom: 8px;">
        <span style="font-size: 1.2rem;">📊</span>
        <span>Download Excel File ({filename})</span>
    </a>
    """
    st.markdown(html_btn, unsafe_allow_html=True)

def render_pdf_download_button(file_path: str, filename: str):
    """Render a direct HTML5 download button that guarantees .pdf file extension in browser."""
    if not file_path or not os.path.exists(file_path):
        st.warning("PDF file not available on disk.")
        return
    with open(file_path, "rb") as f:
        data_bytes = f.read()
    b64 = base64.b64encode(data_bytes).decode()
    html_btn = f"""
    <a href="data:application/pdf;base64,{b64}" 
       download="{filename}" 
       style="display: flex; align-items: center; justify-content: center; gap: 8px;
              width: 100%; padding: 12px 18px; background-color: #2563eb; color: #ffffff !important; 
              text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 0.95rem;
              box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25); border: 1px solid #1d4ed8; text-align: center; margin-bottom: 8px;">
        <span style="font-size: 1.2rem;">📄</span>
        <span>Download PDF File ({filename})</span>
    </a>
    """
    st.markdown(html_btn, unsafe_allow_html=True)

# Custom Styling for Clean SaaS Aesthetic
CUSTOM_CSS = """
<style>
    /* Global resets and typography */
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        color: #0f172a;
    }
    
    .stApp {
        background-color: #f8fafc;
    }
    
    /* Metric Cards */
    .metric-card {
        background: #ffffff;
        border-radius: 14px;
        padding: 1.35rem 1.5rem;
        border: 1px solid #e2e8f0;
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        position: relative;
        overflow: hidden;
    }
    .metric-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 16px -2px rgba(15, 23, 42, 0.08);
    }
    .metric-card::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #059669, #2563eb);
    }
    .metric-label {
        font-size: 0.8rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #64748b;
        margin-bottom: 0.35rem;
    }
    .metric-value {
        font-size: 1.85rem;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.02em;
    }
    .metric-sub {
        font-size: 0.82rem;
        color: #059669;
        font-weight: 600;
        margin-top: 0.3rem;
    }
    
    /* Chat Bubbles */
    .chat-bubble-user {
        background: #2563eb;
        color: #ffffff;
        padding: 0.9rem 1.25rem;
        border-radius: 16px 16px 4px 16px;
        margin-bottom: 0.85rem;
        max-width: 78%;
        margin-left: auto;
        font-size: 0.95rem;
        line-height: 1.5;
        box-shadow: 0 2px 6px rgba(37, 99, 235, 0.15);
    }
    
    .chat-bubble-bot {
        background: #ffffff;
        color: #1e293b;
        padding: 0.9rem 1.25rem;
        border-radius: 16px 16px 16px 4px;
        margin-bottom: 0.85rem;
        max-width: 82%;
        margin-right: auto;
        font-size: 0.95rem;
        line-height: 1.5;
        border: 1px solid #e2e8f0;
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
    }
    
    /* Badges */
    .badge-status {
        padding: 0.25rem 0.65rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 700;
        display: inline-block;
    }
    .badge-generated {
        background-color: #dbeafe;
        color: #1d4ed8;
    }
    .badge-paid {
        background-color: #dcfce7;
        color: #15803d;
    }
    .badge-draft {
        background-color: #fef3c7;
        color: #b45309;
    }
    
    /* Notice */
    .non-gst-banner {
        background-color: #ecfdf5;
        border-left: 4px solid #059669;
        padding: 0.65rem 1rem;
        border-radius: 0 8px 8px 0;
        font-size: 0.85rem;
        color: #065f46;
        margin-bottom: 1rem;
    }
</style>
"""

st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


# ==================== SESSION STATE ====================
if "chat_messages" not in st.session_state:
    st.session_state.chat_messages = [
        {
            "role": "assistant",
            "content": "👋 Welcome to **AI Invoice Studio**! I can create non-GST invoices from conversational prompts. Try typing:\n\n*\"Generate a non-GST invoice for Aaditi Abhijeet Raut for ₹2,500 for one promotional video, dated 29 October 2026, with a discount of ₹200.\"*",
        }
    ]

if "pending_draft" not in st.session_state:
    st.session_state.pending_draft = None

if "last_generated_invoice" not in st.session_state:
    st.session_state.last_generated_invoice = None


# ==================== SIDEBAR ====================
with st.sidebar:
    if os.path.exists(LOGO_PATH):
        st.image(LOGO_PATH, use_container_width=True)
        st.markdown(
            '<div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px; margin-bottom:12px;">'
            '<span style="background:#dcfce7; color:#15803d; font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:12px; letter-spacing:0.04em;">AI STUDIO</span>'
            '<span style="background:#eff6ff; color:#1d4ed8; font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:12px; letter-spacing:0.04em;">NON-GST</span>'
            '<span style="color:#64748b; font-size:0.75rem; font-weight:700;">v2.0</span>'
            '</div>',
            unsafe_allow_html=True,
        )
        st.markdown("<hr style='margin: 8px 0 14px 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
    else:
        st.markdown('<div class="brand-title">🧾 DERMALIST</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="brand-subtitle">AI Invoice Studio • Non-GST</div>',
            unsafe_allow_html=True,
        )

    page = st.radio(
        "Navigation",
        ["📊 Dashboard", "💬 Create Invoice", "👥 Creators", "📜 Invoice History", "⚙️ Settings"],
        index=0,
    )

    st.markdown("---")
    st.markdown(
        """
        <div class="non-gst-banner">
            <b>Notice:</b> Dedicated for Non-GST invoicing. No GST is added to any calculation.
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Database Status indicator
    db_name = database.get_db_type()
    if "PostgreSQL" in db_name:
        st.success("Database: Neon PostgreSQL", icon="🐘")
    else:
        st.info(f"Database: {db_name}", icon="💾")

    # Template Status indicator
    tpl_ok = excel_service.verify_template()
    if tpl_ok:
        st.success("Master Excel: Active", icon="✅")
        tpl_bytes = get_template_bytes(excel_service.template_path)
        if tpl_bytes:
            st.download_button(
                label="📥 Download Master Template",
                data=tpl_bytes,
                file_name="non gst invoice format - Dermalist (2).xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True,
                help="Download the original blank master Excel template"
            )
    else:
        st.error("Master Excel: Missing!", icon="⚠️")

    # Groq Key Status
    groq_key = os.getenv("GROQ_API_KEY", "")
    if groq_key:
        st.info(f"Groq API: Connected ({os.getenv('GROQ_MODEL', 'qwen/qwen3.8-27b')})", icon="⚡")
    else:
        st.warning("Groq API Key: Not Configured", icon="🔑")


# ==================== PAGE: DASHBOARD ====================
if page == "📊 Dashboard":
    render_top_header("Business Dashboard", "Overview of your non-GST invoicing operations, monthly volume, and receivables.")

    metrics = get_cached_dashboard_metrics()

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Total Invoices</div>
                <div class="metric-value">{metrics['total_invoices']}</div>
                <div class="metric-sub">All-time generated</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with c2:
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Monthly Volume</div>
                <div class="metric-value">{metrics['monthly_invoices']} / 100</div>
                <div class="metric-sub">Target ~100 / month</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with c3:
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Total Billed</div>
                <div class="metric-value">₹{metrics['total_billed']:,.2f}</div>
                <div class="metric-sub">Cumulative payable</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with c4:
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Pending Payments</div>
                <div class="metric-value">₹{metrics['pending_total']:,.2f}</div>
                <div class="metric-sub">{metrics['pending_count']} unpaid invoices</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown("<br>", unsafe_allow_html=True)

    # Quick Actions
    col_a, col_b = st.columns([2, 1])
    with col_a:
        st.subheader("Recent Invoices")
        recent_invoices = database.get_invoices(limit=5)

        if recent_invoices:
            display_data = []
            for inv in recent_invoices:
                display_data.append(
                    {
                        "Invoice #": inv["invoice_number"],
                        "Date": inv["invoice_date"],
                        "Creator": inv["creator_name"],
                        "Service": inv["service_description"],
                        "Amount": f"₹{inv['balance_due']:,.2f}",
                        "Status": inv["status"],
                    }
                )
            st.dataframe(pd.DataFrame(display_data), use_container_width=True, hide_index=True)
        else:
            st.info("No invoices generated yet. Use the Create Invoice page to generate your first invoice!")

    with col_b:
        st.subheader("Quick Links")
        st.markdown(
            """
            - **Non-GST Compliance:** Automatically formats invoices with creator PAN, payment terms, and MSME declarations.
            - **Template Integrity:** Merged cells, typography, and borders of the Dermalist template are 100% preserved.
            - **Calculations:** Subtotals, discounts, and balances are calculated strictly in Python.
            """
        )
        if st.button("➕ Generate New Invoice", type="primary", use_container_width=True):
            st.session_state.page = "💬 Create Invoice"
            st.rerun()


# ==================== PAGE: CREATE INVOICE (CHATBOT + PREVIEW) ====================
elif page == "💬 Create Invoice":
    render_top_header("AI Invoice Generator", "Conversational non-GST invoice generator powered by Groq & Dermalist master templates.")

    # Preset quick prompts
    st.markdown("**Quick Prompts:**")
    prompt_col1, prompt_col2, prompt_col3, prompt_col4 = st.columns(4)
    preset_chosen = None

    with prompt_col1:
        if st.button("🎬 Aaditi Raut: ₹2,500 (-₹200)", use_container_width=True):
            preset_chosen = (
                "Generate a non-GST invoice for Aaditi Abhijeet Raut for ₹2,500 for one promotional video, "
                "dated 29 October 2026, with a discount of ₹200."
            )
    with prompt_col2:
        if st.button("📸 Rohan: ₹5,000 for 2 Reels", use_container_width=True):
            preset_chosen = (
                "Create a non-GST invoice for Rohan Sharma for ₹5,000 for 2 Instagram Reels, "
                "dated 30 October 2026, discount ₹0."
            )
    with prompt_col3:
        if st.button("✨ Priya: ₹3,800 Skincare", use_container_width=True):
            preset_chosen = (
                "Generate an invoice for Priya Venkat for ₹3,800 for Skincare Brand Review Video, "
                "dated today with ₹300 discount."
            )
    with prompt_col4:
        if st.button("📢 BMM: Peel Spray ₹15,016", use_container_width=True):
            preset_chosen = (
                "Generate a non-GST invoice for Aaditi Abhijeet Raut for ₹15,016.43 for SP M Peel Spray Combo Campaign "
                "for B M M RETAIL PRIVATE LIMITED, dated 30 September 2026."
            )

    st.markdown("---")

    # Chat history display
    chat_container = st.container()
    with chat_container:
        for msg in st.session_state.chat_messages:
            if msg["role"] == "user":
                st.markdown(f'<div class="chat-bubble-user">{msg["content"]}</div>', unsafe_allow_html=True)
            else:
                st.markdown(f'<div class="chat-bubble-bot">{msg["content"]}</div>', unsafe_allow_html=True)

    # User Input form
    with st.form("chat_form", clear_on_submit=True):
        user_input = st.text_input(
            "Your instruction:",
            placeholder="e.g. Generate invoice for Aaditi Abhijeet Raut for ₹2,500 for one video, date 29-10-2026, discount ₹200",
            label_visibility="collapsed",
        )
        col_submit, col_clear = st.columns([5, 1])
        with col_submit:
            submit_clicked = st.form_submit_button("Send Instruction", type="primary", use_container_width=True)
        with col_clear:
            clear_clicked = st.form_submit_button("Clear", use_container_width=True)

    if clear_clicked:
        st.session_state.chat_messages = [st.session_state.chat_messages[0]]
        st.session_state.pending_draft = None
        st.session_state.last_generated_invoice = None
        st.rerun()

    query_to_process = preset_chosen or (user_input.strip() if submit_clicked and user_input.strip() else None)

    if query_to_process:
        # Append user message
        st.session_state.chat_messages.append({"role": "user", "content": query_to_process})

        with st.spinner("🤖 Analyzing your invoice instruction with Groq..."):
            # Convert session chat history for LLM context
            history_for_llm = [
                {"role": m["role"], "content": m["content"]}
                for m in st.session_state.chat_messages
                if m.get("content")
            ]
            extraction = groq_service.parse_invoice_request(query_to_process, chat_history=history_for_llm)

            bot_reply = extraction.get("bot_reply", "Understood your request.")
            st.session_state.chat_messages.append({"role": "assistant", "content": bot_reply})

            if extraction.get("is_complete"):
                # Prepare draft with Python calculations and creator matching
                draft = invoice_service.prepare_invoice_draft(extraction)
                st.session_state.pending_draft = draft
            else:
                st.session_state.pending_draft = None

        st.rerun()

    # ==================== DRAFT PREVIEW & CONFIRMATION ====================
    if st.session_state.pending_draft:
        draft = st.session_state.pending_draft

        st.markdown("### 📋 Invoice Draft Preview (Requires Confirmation)")
        st.info("Please review and optionally adjust the details below. Click **Confirm & Generate Invoice** to generate the files.")

        with st.container():
            # Editable form for draft
            with st.form("draft_confirmation_form"):
                st.markdown("##### 1. Invoice & Creator Metadata")
                col_inv1, col_inv2, col_inv3 = st.columns(3)

                with col_inv1:
                    inv_number = st.text_input("Invoice Number", value=draft["invoice_number"])
                with col_inv2:
                    inv_date = st.text_input("Invoice Date", value=draft["invoice_date"])
                with col_inv3:
                    prompt_creator_name = draft.get("creator_name") or ""
                    creator_name_input = st.text_input("Creator Name *", value=prompt_creator_name)

                # Check if prompt matches an existing saved creator in DB
                all_creators = database.get_creators()
                matched_creator = None
                default_sel_idx = 0
                if creator_name_input.strip():
                    matched = database.find_creator_by_name(creator_name_input.strip())
                    if matched and matched["name"].strip().lower() == creator_name_input.strip().lower():
                        matched_creator = matched
                        for idx, c in enumerate(all_creators):
                            if c["id"] == matched["id"]:
                                default_sel_idx = idx + 1
                                break

                profile_options = ["-- Enter Unique / New Creator --"] + [f"👤 {c['name']}" for c in all_creators]
                col_sel_prof, col_sel_note = st.columns([2, 3])
                with col_sel_prof:
                    selected_profile_label = st.selectbox(
                        "Auto-fill Details from Saved Profile (Optional):",
                        options=profile_options,
                        index=default_sel_idx,
                        help="Choose a saved creator to auto-fill their PAN and bank details, or keep 'Enter Unique' to supply custom data.",
                    )
                with col_sel_note:
                    st.markdown("<div style='height: 25px;'></div>", unsafe_allow_html=True)
                    if selected_profile_label != "-- Enter Unique / New Creator --":
                        st.caption("✅ Auto-filled from saved database profile.")
                    else:
                        st.caption("🆕 Unique / New creator data will be saved with this invoice.")

                # Determine base creator data to populate fields
                base_data = {}
                linked_creator_id = None
                if selected_profile_label != "-- Enter Unique / New Creator --":
                    for c in all_creators:
                        if f"👤 {c['name']}" == selected_profile_label:
                            base_data = dict(c)
                            linked_creator_id = c["id"]
                            break
                elif matched_creator:
                    base_data = dict(matched_creator)
                    linked_creator_id = matched_creator["id"]

                # Editable Creator & Banking Details
                with st.expander("👤 Creator Details & Banking Information (Editable)", expanded=True):
                    c_col1, c_col2, c_col3 = st.columns(3)
                    with c_col1:
                        c_address = st.text_input("Address *", value=base_data.get("address") or "Creator Address, India")
                        c_phone = st.text_input("Contact Phone", value=base_data.get("phone") or "")
                        c_email = st.text_input("Email ID", value=base_data.get("email") or "")
                    with c_col2:
                        c_pan = st.text_input("PAN Number", value=base_data.get("pan") or "").upper()
                        c_upi = st.text_input("UPI ID", value=base_data.get("upi_id") or "")
                        c_bank_name = st.text_input("Bank Name", value=base_data.get("bank_name") or "")
                    with c_col3:
                        c_bank_acc = st.text_input("Bank Account Number", value=base_data.get("bank_account") or "")
                        c_ifsc = st.text_input("IFSC Code", value=base_data.get("ifsc") or "").upper()
                        c_holder = st.text_input("Account Holder Name", value=base_data.get("account_holder") or creator_name_input.strip())

                st.markdown("##### 2. Service & Line Items")
                col_srv1, col_srv2 = st.columns([3, 1])
                with col_srv1:
                    srv_desc = st.text_input("Service Description", value=draft["service_description"])
                with col_srv2:
                    srv_qty = st.number_input("Quantity", min_value=1, step=1, value=int(draft["quantity"]))

                col_pr1, col_pr2, col_pr3 = st.columns(3)
                with col_pr1:
                    unit_price = st.number_input("Unit Price (₹)", min_value=0.0, step=100.0, value=float(draft["unit_price"]))
                with col_pr2:
                    discount = st.number_input("Discount (₹)", min_value=0.0, step=50.0, value=float(draft["discount"]))
                with col_pr3:
                    video_link = st.text_input("Video Link (Optional)", value=draft.get("video_link", ""))

                # Python Calculation
                computed = calculate_invoice_totals(unit_price, srv_qty, discount)

                st.markdown("##### 3. Calculation Summary (Non-GST)")
                sum_col1, sum_col2, sum_col3, sum_col4 = st.columns(4)
                with sum_col1:
                    st.metric("Taxable Value", f"₹{computed['taxable_value']:,.2f}")
                with sum_col2:
                    st.metric("Discount", f"₹{computed['discount']:,.2f}")
                with sum_col3:
                    st.metric("Subtotal Less Disc.", f"₹{computed['subtotal_less_discount']:,.2f}")
                with sum_col4:
                    st.metric("Total Payable", f"₹{computed['balance_due']:,.2f}")

                generate_btn = st.form_submit_button(
                    "🚀 Confirm & Generate Invoice (Excel + PDF)",
                    type="primary",
                    use_container_width=True,
                )

                if generate_btn:
                    with st.spinner("Generating invoice workbook and PDF with unique creator data..."):
                        final_creator_name = creator_name_input.strip() or "Creator Name"
                        chosen_creator_payload = {
                            "id": linked_creator_id,
                            "name": final_creator_name,
                            "address": c_address.strip(),
                            "email": c_email.strip(),
                            "phone": c_phone.strip(),
                            "pan": c_pan.strip(),
                            "upi_id": c_upi.strip(),
                            "bank_account": c_bank_acc.strip(),
                            "ifsc": c_ifsc.strip(),
                            "account_holder": c_holder.strip() or final_creator_name,
                            "bank_name": c_bank_name.strip(),
                        }

                        final_invoice_data = {
                            "invoice_number": inv_number,
                            "creator_id": linked_creator_id,
                            "creator_name": final_creator_name,
                            "invoice_date": inv_date,
                            "service_description": srv_desc,
                            "quantity": computed["quantity"],
                            "unit_price": computed["unit_price"],
                            "taxable_value": computed["taxable_value"],
                            "discount": computed["discount"],
                            "subtotal_less_discount": computed["subtotal_less_discount"],
                            "balance_due": computed["balance_due"],
                            "video_link": video_link,
                            "status": "Generated",
                        }

                        try:
                            generated = invoice_service.generate_and_save_invoice(
                                invoice_data=final_invoice_data,
                                creator_data=chosen_creator_payload,
                            )
                            st.cache_data.clear()
                            st.session_state.last_generated_invoice = generated
                            st.session_state.pending_draft = None
                            st.success(f"🎉 Invoice {inv_number} successfully generated for {final_creator_name}!")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Error generating invoice: {str(e)}")

    # ==================== DOWNLOAD SECTION ====================
    if st.session_state.last_generated_invoice:
        last_inv = st.session_state.last_generated_invoice
        st.markdown("---")
        st.subheader("📥 Download Generated Files")
        st.success(
            f"✅ Invoice **{last_inv['invoice_number']}** for **{last_inv['creator_name']}** "
            f"(₹{last_inv['balance_due']:,.2f}) generated successfully!"
        )
        st.info("ℹ️ **Master Template Used:** `non gst invoice format - Dermalist (2).xlsx`. The completed Excel workbook preserves all original layouts, borders, and fonts.")

        dl_col1, dl_col2 = st.columns(2)
        excel_path = last_inv.get("excel_path")
        pdf_path = last_inv.get("pdf_path")
        clean_name = re.sub(r'[^a-zA-Z0-9_-]', '_', last_inv.get('creator_name', 'Creator')).strip('_')
        inv_num = last_inv.get('invoice_number', '001')
        excel_filename = f"{clean_name}_Invoice_{inv_num}.xlsx"
        pdf_filename = f"{clean_name}_Invoice_{inv_num}.pdf"

        with dl_col1:
            if excel_path and os.path.exists(excel_path):
                # 1. Direct HTML5 Download link (guarantees .xlsx extension)
                render_excel_download_button(excel_path, excel_filename)
                # 2. Secondary Streamlit download button
                with open(excel_path, "rb") as f:
                    st.download_button(
                        label="⬇️ Alternative Excel Download (.xlsx)",
                        data=f.read(),
                        file_name=excel_filename,
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        key=f"alt_dl_excel_{last_inv['id']}",
                        use_container_width=True,
                    )
            else:
                st.warning("Excel file not available.")

        with dl_col2:
            if pdf_path and os.path.exists(pdf_path):
                # 1. Direct HTML5 Download link (guarantees .pdf extension)
                render_pdf_download_button(pdf_path, pdf_filename)
                # 2. Secondary Streamlit download button
                with open(pdf_path, "rb") as f:
                    st.download_button(
                        label="⬇️ Alternative PDF Download (.pdf)",
                        data=f.read(),
                        file_name=pdf_filename,
                        mime="application/pdf",
                        key=f"alt_dl_pdf_{last_inv['id']}",
                        use_container_width=True,
                    )
            else:
                st.warning("PDF file not available.")


# ==================== PAGE: CREATORS ====================
elif page == "👥 Creators":
    render_top_header("Creator Profiles", "Manage influencer profiles, verified PAN numbers, and secure banking information in Neon PostgreSQL.")

    tab1, tab2 = st.tabs(["📋 View & Search Creators", "➕ Add New Creator"])

    with tab1:
        search_query = st.text_input("🔍 Search creator by name, email, phone, or PAN:", "")
        creators = database.get_creators(search_query=search_query)

        if creators:
            for creator in creators:
                with st.expander(f"👤 {creator['name']} ({creator['email'] or 'No email'})", expanded=False):
                    edit_form_key = f"edit_creator_{creator['id']}"
                    with st.form(edit_form_key):
                        c_col1, c_col2 = st.columns(2)
                        with c_col1:
                            edit_name = st.text_input("Full Name *", value=creator["name"])
                            edit_address = st.text_area("Address *", value=creator["address"])
                            edit_email = st.text_input("Email Address", value=creator["email"])
                            edit_phone = st.text_input("Contact Number", value=creator["phone"])
                            edit_pan = st.text_input("PAN Number", value=creator["pan"])
                        with c_col2:
                            edit_upi = st.text_input("UPI ID", value=creator["upi_id"])
                            edit_bank_acc = st.text_input("Bank Account Number", value=creator["bank_account"])
                            edit_ifsc = st.text_input("IFSC Code", value=creator["ifsc"])
                            edit_holder = st.text_input("Account Holder Name", value=creator["account_holder"])
                            edit_bank_name = st.text_input("Bank Name", value=creator["bank_name"])

                        btn_col1, btn_col2 = st.columns([1, 4])
                        with btn_col1:
                            save_btn = st.form_submit_button("Save Changes", type="primary")

                        if save_btn:
                            update_data = {
                                "name": edit_name,
                                "address": edit_address,
                                "email": edit_email,
                                "phone": edit_phone,
                                "pan": edit_pan,
                                "upi_id": edit_upi,
                                "bank_account": edit_bank_acc,
                                "ifsc": edit_ifsc,
                                "account_holder": edit_holder,
                                "bank_name": edit_bank_name,
                            }
                            is_valid, errors = validate_creator_payload(update_data)
                            if not is_valid:
                                st.error("; ".join(errors))
                            else:
                                database.update_creator(creator["id"], update_data)
                                st.cache_data.clear()
                                st.success("Creator profile updated successfully!")
                                st.rerun()

                    with st.expander("🗑️ Danger Zone: Delete Profile", expanded=False):
                        st.caption("Note: Creators with existing invoices cannot be deleted to preserve financial history.")
                        if st.button("Permanently Delete Creator", key=f"del_creator_{creator['id']}", type="secondary"):
                            try:
                                database.delete_creator(creator["id"])
                                st.cache_data.clear()
                                st.success(f"Creator '{creator['name']}' deleted.")
                                st.rerun()
                            except ValueError as ve:
                                st.warning(str(ve))
                            except Exception as ex:
                                st.error(f"Could not delete creator: {str(ex)}")
            st.info("No creator profiles match your query.")

    with tab2:
        st.subheader("Register New Creator")
        with st.form("new_creator_form", clear_on_submit=True):
            n_col1, n_col2 = st.columns(2)
            with n_col1:
                new_name = st.text_input("Full Name *", placeholder="e.g. Aaditi Abhijeet Raut")
                new_address = st.text_area("Address (Full with State & PIN) *", placeholder="Flat 402, Sunshine...")
                new_email = st.text_input("Email Address", placeholder="creator@example.com")
                new_phone = st.text_input("Contact Number", placeholder="+91 98201 XXXXX")
                new_pan = st.text_input("PAN Number", placeholder="ABCDE1234F")
            with n_col2:
                new_upi = st.text_input("UPI ID", placeholder="creator@okhdfcbank")
                new_bank_acc = st.text_input("Bank Account Number", placeholder="50100234567890")
                new_ifsc = st.text_input("IFSC Code", placeholder="HDFC0000123")
                new_holder = st.text_input("Account Holder Name", placeholder="Matches bank record")
                new_bank_name = st.text_input("Bank Name", placeholder="HDFC Bank")

            add_creator_btn = st.form_submit_button("Create Profile", type="primary")
            if add_creator_btn:
                data = {
                    "name": new_name,
                    "address": new_address,
                    "email": new_email,
                    "phone": new_phone,
                    "pan": new_pan,
                    "upi_id": new_upi,
                    "bank_account": new_bank_acc,
                    "ifsc": new_ifsc,
                    "account_holder": new_holder,
                    "bank_name": new_bank_name,
                }
                is_valid, errors = validate_creator_payload(data)
                if not is_valid:
                    st.error("; ".join(errors))
                else:
                    new_id = database.create_creator(data)
                    st.cache_data.clear()
                    st.success(f"Creator '{new_name}' created successfully (ID: {new_id})!")
                    st.rerun()


# ==================== PAGE: INVOICE HISTORY ====================
elif page == "📜 Invoice History":
    render_top_header("Invoice History & Records", "Search, filter, update payment status, and re-download any previously generated invoice.")

    # Filter row
    f_col1, f_col2, f_col3, f_col4 = st.columns([2, 2, 2, 1])
    with f_col1:
        hist_search = st.text_input("🔍 Search by Invoice #, Creator, or Service", "")
    with f_col2:
        all_creators = database.get_creators()
        creator_filter_options = [("All Creators", None)] + [(c["name"], c["id"]) for c in all_creators]
        selected_creator_tuple = st.selectbox(
            "Filter by Creator",
            options=creator_filter_options,
            format_func=lambda x: x[0],
        )
    with f_col3:
        status_filter = st.selectbox("Status Filter", ["All", "Generated", "Paid", "Draft"])
    with f_col4:
        st.markdown("<div style='height: 28px'></div>", unsafe_allow_html=True)
        export_csv_requested = st.button("📥 Export CSV", use_container_width=True)

    invoices = database.get_invoices(
        search_query=hist_search,
        creator_id=selected_creator_tuple[1],
        status=status_filter,
    )

    if export_csv_requested and invoices:
        csv_data = invoice_service.export_invoices_to_csv(invoices)
        st.download_button(
            label="Click here to download CSV",
            data=csv_data,
            file_name=f"Invoices_Export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv",
        )

    st.markdown(f"**Found {len(invoices)} invoice(s)**")

    if invoices:
        for inv in invoices:
            status_class = {
                "Generated": "badge-generated",
                "Paid": "badge-paid",
                "Draft": "badge-draft",
            }.get(inv["status"], "badge-generated")

            with st.expander(
                f"🧾 **{inv['invoice_number']}** | {inv['creator_name']} | ₹{inv['balance_due']:,.2f} | Date: {inv['invoice_date']} | Status: {inv['status']}",
                expanded=False,
            ):
                det_col1, det_col2, det_col3 = st.columns([2, 2, 2])
                with det_col1:
                    st.markdown(f"**Service:** {inv['service_description']}")
                    st.markdown(f"**Quantity:** {inv['quantity']} | **Unit Price:** ₹{inv['unit_price']:,.2f}")
                    if inv.get("video_link"):
                        st.markdown(f"**Video Link:** [{inv['video_link']}]({inv['video_link']})")
                with det_col2:
                    st.markdown(f"**Taxable Value:** ₹{inv['taxable_value']:,.2f}")
                    st.markdown(f"**Discount:** ₹{inv['discount']:,.2f}")
                    st.markdown(f"**Balance Due:** **₹{inv['balance_due']:,.2f}**")
                with det_col3:
                    # Status updater
                    new_status = st.selectbox(
                        "Update Status",
                        options=["Generated", "Paid", "Draft"],
                        index=["Generated", "Paid", "Draft"].index(inv["status"])
                        if inv["status"] in ["Generated", "Paid", "Draft"]
                        else 0,
                        key=f"status_select_{inv['id']}",
                    )
                    if new_status != inv["status"]:
                        database.update_invoice_status(inv["id"], new_status)
                        st.cache_data.clear()
                        st.success(f"Status updated to {new_status}!")
                        st.rerun()

                st.markdown("---")
                # Download buttons for previously generated files
                d_col1, d_col2 = st.columns(2)
                hist_creator = re.sub(r'[^a-zA-Z0-9_-]', '_', inv.get('creator_name', 'Creator')).strip('_')
                hist_inv_no = inv.get('invoice_number', '001')
                with d_col1:
                    if inv.get("excel_path") and os.path.exists(inv["excel_path"]):
                        render_excel_download_button(inv["excel_path"], f"{hist_creator}_Invoice_{hist_inv_no}.xlsx")
                    else:
                        st.caption("Excel file not found on disk.")

                with d_col2:
                    if inv.get("pdf_path") and os.path.exists(inv["pdf_path"]):
                        render_pdf_download_button(inv["pdf_path"], f"{hist_creator}_Invoice_{hist_inv_no}.pdf")
                    else:
                        st.caption("PDF file not found on disk.")
    else:
        st.info("No invoice records found matching your filters.")


# ==================== PAGE: SETTINGS ====================
elif page == "⚙️ Settings":
    render_top_header("System & Configuration Settings", "Configure LLM models, test Neon PostgreSQL connection, and manage master Excel templates.")

    with st.form("settings_form"):
        st.subheader("Groq API Configuration")
        curr_key = os.getenv("GROQ_API_KEY", "")
        # Mask key partially for UI safety
        masked_key = curr_key[:8] + "..." + curr_key[-4:] if len(curr_key) > 12 else curr_key
        st.caption(f"Active Key: `{masked_key}`")

        input_key = st.text_input(
            "Update Groq API Key (leave blank to keep current):",
            type="password",
            placeholder="gsk_...",
        )

        model_options = [
            "llama-3.3-70b-versatile",
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
        ]
        curr_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        model_idx = model_options.index(curr_model) if curr_model in model_options else 0
        selected_model = st.selectbox("Primary Groq LLM Model", options=model_options, index=model_idx)

        st.markdown("---")
        st.subheader("Invoice Numbering & Template")
        inv_prefix = st.text_input("Invoice Prefix", value=os.getenv("INVOICE_PREFIX", "DL-"))
        tpl_path = st.text_input("Master Template Path", value=os.getenv("TEMPLATE_PATH", "templates/non gst invoice format - Dermalist (2).xlsx"))

        save_settings = st.form_submit_button("Save Settings", type="primary")

        if save_settings:
            # Update .env
            env_lines = []
            env_file = ".env"
            existing_vars = {}
            if os.path.exists(env_file):
                with open(env_file, "r") as f:
                    for line in f:
                        if "=" in line and not line.strip().startswith("#"):
                            k, v = line.strip().split("=", 1)
                            existing_vars[k.strip()] = v.strip()

            if input_key.strip():
                existing_vars["GROQ_API_KEY"] = input_key.strip()
                os.environ["GROQ_API_KEY"] = input_key.strip()

            existing_vars["GROQ_MODEL"] = selected_model
            os.environ["GROQ_MODEL"] = selected_model
            existing_vars["INVOICE_PREFIX"] = inv_prefix
            os.environ["INVOICE_PREFIX"] = inv_prefix
            existing_vars["TEMPLATE_PATH"] = tpl_path
            os.environ["TEMPLATE_PATH"] = tpl_path

            with open(env_file, "w") as f:
                for k, v in existing_vars.items():
                    f.write(f"{k}={v}\n")

            st.success("Settings saved successfully!")
            st.rerun()

    # Master Template Management section
    st.markdown("---")
    st.subheader("📁 Master Template Management")
    st.markdown(
        "Manage the official master Excel template: `non gst invoice format - Dermalist (2).xlsx`. "
        "Every invoice generated by the application uses this master template."
    )
    t_col1, t_col2 = st.columns(2)
    with t_col1:
        st.markdown("**Download Active Master Template:**")
        if os.path.exists(tpl_path):
            with open(tpl_path, "rb") as f_tpl:
                st.download_button(
                    label="📥 Download Master Blank Template (.xlsx)",
                    data=f_tpl.read(),
                    file_name=os.path.basename(tpl_path),
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    use_container_width=True,
                )
        else:
            st.error("Template file not found at path.")

    with t_col2:
        st.markdown("**Upload Updated Master Template (.xlsx):**")
        uploaded_template = st.file_uploader(
            "Upload replacement .xlsx template",
            type=["xlsx"],
            label_visibility="collapsed",
        )
        if uploaded_template is not None:
            save_dest = tpl_path
            os.makedirs(os.path.dirname(os.path.abspath(save_dest)), exist_ok=True)
            with open(save_dest, "wb") as f_dest:
                f_dest.write(uploaded_template.getbuffer())
            st.success(f"Master template successfully replaced at `{save_dest}`!")
            st.rerun()

    # Diagnostics section
    st.markdown("---")
    st.subheader("🔍 Diagnostics & Environment Check")
    d1, d2, d3 = st.columns(3)
    with d1:
        st.markdown("**Template File:**")
        if os.path.exists(tpl_path):
            st.success(f"Active: {tpl_path}")
        else:
            st.error(f"Missing: {tpl_path}")
    with d2:
        st.markdown("**PDF Engine:**")
        if pdf_service.libreoffice_path:
            st.success("LibreOffice Headless Detected")
        else:
            st.info("ReportLab Engine (Default Fallback Active)")
    with d3:
        st.markdown("**Database Engine:**")
        db_type = database.get_db_type()
        if "PostgreSQL" in db_type:
            st.success(f"{db_type} (Neon Cloud)")
        else:
            db_path = os.getenv("DB_PATH", "data/invoice_studio.db")
            st.info(f"{db_type}: {db_path}")
