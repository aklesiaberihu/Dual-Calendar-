# Zemen — Dual Calendar Web Application

A full-stack collaborative scheduling platform for managing events across both the **Ethiopian** and **Gregorian** calendar systems.

Built by Aklesia Berihu Mekonnen and Meron Zemichael Kahsay — 4th Year Data Analysis, Software Engineering Project.

---

## Features

- **Dual-calendar support** — view and manage events in Ethiopian and Gregorian calendars simultaneously
- **Date conversion** — instantly convert any date between the two calendar systems, including the 13th month (Pagume)
- **Event management** — full CRUD with recurrence (daily/weekly), timezone support, and full-text search
- **Shared events** — collaborate with role-based access (owner, editor, viewer)
- **Optimistic locking** — concurrent edits are detected with version conflict resolution (409 response + force-save option)
- **Version history & diff** — every event update is snapshotted; field-level diffs available between any two versions
- **Smart scheduling** — interval merging, gap finding, and constraint-based slot ranking across all participants
- **Email reminders** — SMTP-based background daemon sends reminders before events
- **Google OAuth 2.0** — login with Google and export events to Google Calendar
- **Holiday management** — Ethiopian and Gregorian public holidays, seeded on startup

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Backend | FastAPI (Python 3.12) |
| Database | PostgreSQL 15 |
| Auth | JWT + Google OAuth 2.0 |
| Email | SMTP (smtplib + TLS) |
| Deployment | Docker Compose |
| Testing | Pytest (139 tests) + Postman (117 assertions) |

---

## Getting Started

### Prerequisites

- Docker and Docker Compose installed

### Run the project

1. Clone the repository:
```bash
git clone https://github.com/aklesiaberihu/Dual-Calendar-.git
cd Dual-Calendar-
```

2. Copy the environment config and fill in your credentials:
```bash
cp docker-compose.yml docker-compose.local.yml
# Edit docker-compose.local.yml and replace placeholder values:
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
# - SMTP_PASSWORD
# - SECRET_KEY
```

3. Start the application:
```bash
docker compose up --build
```

4. Open in browser:
- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs

---

## Running Tests

```bash
cd backend
python3.12 -m pytest tests/ -v
```

139 tests across 12 test files covering: authentication, date conversion edge cases, interval merging, ranking, scheduling pipeline, diff, reminders, security, input validation, and UTC storage.

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── core/          # Business logic (conversion, intervals, ranking, diff, auth)
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── routers/       # FastAPI route handlers
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   └── services/      # Background services (reminders)
│   ├── tests/             # Pytest unit tests
│   └── main.py
├── frontend/
│   └── src/
│       └── pages/         # React page components
├── docs/
│   ├── uml/               # PlantUML diagram source files
│   └── final_report.md    # Final project report
├── postman_collection.json # API integration test collection
└── docker-compose.yml
```

---

## API Documentation

Interactive API docs available at **http://localhost:8000/docs** when the backend is running (FastAPI auto-generates Swagger UI).

---

## Postman Collection

Import `postman_collection.json` into Postman to run the full 117-assertion integration suite covering NFR-P1 (performance), NFR-S1 (role enforcement), and API endpoint validation. Set `base_url` to `http://localhost:8000` and run the collection top-to-bottom.
