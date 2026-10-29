#!/bin/bash
# ======================================================================
# AI Invoice Studio — 1-Click Launch Script (Linux / macOS)
# ======================================================================

set -e

echo "======================================================================"
echo "          AI INVOICE STUDIO -- SMART NON-GST GENERATOR"
echo "                   B M M RETAIL PRIVATE LIMITED"
echo "======================================================================"
echo ""

# Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 could not be found. Please install Python 3.11+."
    exit 1
fi

# Create virtual environment if missing
if [ ! -d ".venv" ]; then
    echo "[*] Creating virtual environment (.venv)..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install / verify dependencies
echo "[*] Verifying dependencies..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

# Setup .env if missing
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "[*] Creating .env from .env.example..."
    cp .env.example .env
fi

echo ""
echo "======================================================================"
echo "[*] Starting Streamlit server on http://localhost:8501 ..."
echo "[*] Press CTRL+C to terminate."
echo "======================================================================"
echo ""

streamlit run app.py --server.headless=false --server.port=8501
