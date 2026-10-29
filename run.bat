@echo off
setlocal enabledelayedexpansion

title AI Invoice Studio — Dermalist

echo ======================================================================
echo           AI INVOICE STUDIO -- SMART NON-GST GENERATOR
echo                    B M M RETAIL PRIVATE LIMITED
echo ======================================================================
echo.

:: Check Python installation
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in your PATH!
    echo Please download and install Python 3.11+ from https://www.python.org/
    pause
    exit /b 1
)

:: Check if virtual environment exists, if not create it
if not exist ".venv" (
    echo [*] Creating virtual environment (.venv)...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: Activate virtual environment
call .venv\Scripts\activate.bat

:: Install / verify dependencies
echo [*] Checking dependencies...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies from requirements.txt.
    pause
    exit /b 1
)

:: Check .env configuration
if not exist ".env" (
    if exist ".env.example" (
        echo [*] Initializing .env from .env.example...
        copy .env.example .env >nul
        echo [!] Created .env file. Please make sure your GROQ_API_KEY is configured.
    )
)

echo.
echo ======================================================================
echo [*] Starting AI Invoice Studio server on http://localhost:8501 ...
echo [*] Press CTRL+C in this terminal window to stop the server.
echo ======================================================================
echo.

:: Launch Streamlit app
streamlit run app.py --server.headless=false --server.port=8501

pause
