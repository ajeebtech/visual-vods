FROM python:3.11-slim

# Install FFmpeg, Tesseract OCR, and system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker script
COPY worker.py .

# Make worker executable
RUN chmod +x worker.py

# Run worker
CMD ["python", "worker.py"]
