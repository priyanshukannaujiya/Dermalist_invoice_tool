# ==============================================================
# AI Invoice Studio — Production Dockerfile
# Optimized for Render, Railway, Fly.io, Cloud Run, AWS ECS, or local Docker
# Includes Python 3.11, LibreOffice Headless, and Fonts for PDF generation
# ==============================================================

FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8501 \
    STREAMLIT_SERVER_PORT=8501 \
    STREAMLIT_SERVER_ADDRESS=0.0.0.0 \
    STREAMLIT_SERVER_HEADLESS=true

# Install system dependencies:
# - libreoffice-calc: For native Excel to PDF conversion
# - default-jre-headless: Runtime for LibreOffice document conversion
# - fonts-dejavu, fonts-liberation: Crisp font rendering
# - curl: Container health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-calc \
    default-jre-headless \
    fonts-dejavu \
    fonts-liberation \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (leverages Docker layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p data generated_invoices assets && \
    useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app

USER appuser

# Expose standard Streamlit port
EXPOSE 8501

# Healthcheck to verify the web server is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8501/_stcore/health || exit 1

# Launch Streamlit server
ENTRYPOINT ["sh", "-c", "streamlit run app.py --server.port=${PORT:-8501} --server.address=0.0.0.0 --server.headless=true"]
