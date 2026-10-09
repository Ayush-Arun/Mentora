# ClariClass — Real-Time Adaptive Lecture Intelligence

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB.svg)](https://react.dev)
[![Socket.IO](https://img.shields.io/badge/RealTime-Socket.IO-010101.svg)](https://socket.io)
[![Gemma AI](https://img.shields.io/badge/AI-Gemma%204%20%2F%20Gemini-4285F4.svg)](https://deepmind.google/technologies/gemma/)

ClariClass is an adaptive classroom web application that detects when a meaningful portion of a class is struggling with the same piece of lecture content — via manual flags, reading behavior, and optional facial/gaze signals — and automatically generates and delivers a simplified explanation to struggling students in real time.

---

## 🏗️ Architecture & Features

- **Document Chunking Engine**: Automatically slices PDF slide decks and PPTX presentations into ordered learning chunks using PyMuPDF and python-pptx.
- **Passwordless OTP Login**: Seamless authentication with one-time verification codes and secure JWT token issuance.
- **Telemetry Ingestion & Scoring**: Tracks manual flags (`Difficult`, `Important`), dwell time (>45s), and client-side eye gaze / facial confusion signals.
- **Privacy-Preserving Edge Compute**: Zero raw webcam video or photos leave the student device; only derived numeric signals are transmitted.
- **Adaptive AI Simplification**: When the classroom struggle threshold is exceeded (e.g. $\ge 25\%$), Gemma 4 generates a simplified pedagogical explanation and pushes it live over WebSockets to struggling students.
- **Teacher Cockpit**: Live struggle heatmap per chunk, highlighted discussion topics, and individual student analytics.

---

## 📁 Project Structure

```
clariclass/
├── docker-compose.yml               # Multi-container production deployment
├── .env.example                     # Environment variable template
├── .gitignore
├── LICENSE                          # MIT License
├── README.md
│
├── backend/                         # FastAPI + Socket.IO Server
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                      # FastAPI + Socket.IO entrypoint
│   ├── config.py                    # Environment & threshold settings
│   ├── db/                          # SQLAlchemy database & models
│   │   ├── database.py
│   │   └── models.py
│   ├── routers/                     # REST API route handlers
│   │   ├── auth.py                  # Passwordless OTP login & verification
│   │   ├── documents.py             # PDF/PPTX upload & chunking
│   │   ├── sessions.py              # Room creation & joining
│   │   ├── signals.py               # Signal ingestion & threshold evaluation
│   │   └── analytics.py             # Teacher heatmap & student metrics
│   ├── services/                    # Business logic & AI pipelines
│   │   ├── otp_service.py           # OTP generation & JWT verification
│   │   ├── document_parser.py       # PDF / PPTX parsing
│   │   ├── struggle_scoring.py      # Threshold calculation
│   │   ├── gemma_client.py          # Gemma 4 / Gemini simplification engine
│   │   └── cache.py                 # In-memory simplification cache
│   ├── sockets/                     # Real-time WebSocket handlers
│   │   └── events.py
│   └── tests/                       # Unit and endpoint test suites
│
├── frontend/                        # React + Vite Frontend
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── api/                     # HTTP client & Socket.IO client
│       ├── components/              # Reusable UI components
│       ├── hooks/                   # Dwell, gaze & expression tracking hooks
│       └── pages/                   # Login, Upload, Join, Reader, Dashboard
│
├── docs/
│   ├── SRS.md                       # Software Requirements Specification
│   ├── ARCHITECTURE_PLAN.md         # 5-Part Architectural Master Plan
│   └── demo-script.md               # Step-by-step hackathon demo flow
│
└── scripts/
    └── seed_sample_doc.py           # Local development seeding script
```

---

## 🚀 Quick Start & Deployment

### Option 1: Docker Compose (Recommended for Production)

1. Copy the environment variables:
   ```bash
   cp .env.example .env
   ```
2. Build and start all services:
   ```bash
   docker-compose up --build
   ```
3. Open your browser:
   - **Frontend**: [http://localhost](http://localhost)
   - **Backend API & Swagger**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Option 2: Local Development

#### 1. Backend Setup
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Running Tests

Execute backend test suites with `pytest`:
```bash
cd backend
pytest tests/
```
