# ReachInbox Email Scheduler

A production-style email scheduling platform built with React, TypeScript, Node.js, PostgreSQL, Redis, BullMQ, Elasticsearch, Slack OAuth, and Google OAuth.

The system supports bulk email scheduling, delayed delivery, concurrency control, hourly rate limiting, automatic rescheduling, restart recovery, email search, CSV/TXT/PDF lead uploads, and Slack notifications when rate limits are reached.

---

## Features

### Authentication
- Google OAuth login
- JWT-based authentication
- HttpOnly authentication cookie
- Protected backend APIs
- Automatic user creation/update in PostgreSQL

### Email Scheduling
- Schedule emails for a future time
- Configurable delay between emails
- Configurable hourly sending limit
- Bulk scheduling for 1000+ recipients
- Duplicate recipient removal
- Email validation

### Queue Processing
- BullMQ backed by Redis
- Worker concurrency control
- Delayed jobs
- Waiting jobs
- Active jobs
- Completed jobs
- Failed jobs

### Rate Limiting
- Redis-backed hourly rate limiter
- Atomic rate-limit reservation
- Automatic job rescheduling
- Slack notification when the hourly limit is reached
- Rate-limit state shared across workers

### Email Providers
- Ethereal SMTP for development/testing
- Message ID tracking
- Ethereal preview URLs

### Lead Upload
Supported file types:

- CSV
- TXT
- PDF

Email addresses are extracted automatically and duplicate addresses are removed.

### Search
- Elasticsearch integration
- Search by email content
- Search across scheduled and sent emails

### Slack
- Slack OAuth
- Slack workspace/channel connection
- Slack connection status
- Slack disconnect
- Rate-limit notifications

### Recovery
- Detection of interrupted processing jobs
- Scheduled-email/BullMQ reconciliation
- Missing BullMQ jobs are recreated during backend startup

---

## Architecture

```text
                    ┌─────────────────────┐
                    │      React UI       │
                    │   Vite + TypeScript │
                    └──────────┬──────────┘
                               │
                               │ HTTP
                               ▼
                    ┌─────────────────────┐
                    │    Express API      │
                    │      Node.js        │
                    └──────┬─────┬────────┘
                           │     │
             ┌─────────────┘     └──────────────┐
             ▼                                   ▼
    ┌─────────────────┐                 ┌─────────────────┐
    │   PostgreSQL    │                 │      Redis      │
    │     Prisma      │                 │                 │
    └─────────────────┘                 └────────┬────────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
                                        │     BullMQ      │
                                        │  Email Queue    │
                                        └────────┬────────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
                                        │  Email Worker   │
                                        │  Concurrency 5  │
                                        └────────┬────────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
                                        │   SMTP /        │
                                        │   Ethereal      │
                                        └─────────────────┘

                    ┌─────────────────┐
                    │  Elasticsearch  │
                    │  Email Search   │
                    └─────────────────┘

                    ┌─────────────────┐
                    │   Slack OAuth   │
                    │ Notifications   │
                    └─────────────────┘

                    ┌─────────────────┐
                    │   Google OAuth  │
                    │  Authentication │
                    └─────────────────┘

                    Email Scheduling Flow
User uploads lead file
        ↓
CSV / TXT / PDF parsing
        ↓
Email extraction
        ↓
Duplicate removal
        ↓
Email validation
        ↓
POST /api/emails/schedule-bulk
        ↓
PostgreSQL createMany()
        ↓
BullMQ addBulk()
        ↓
Delayed jobs
        ↓
Worker processes jobs
        ↓
Redis rate limiter
        ↓
SMTP send
        ↓
PostgreSQL status update
        ↓
Dashboard refresh
Rate Limiting Flow
Email job
   ↓
Redis atomic reservation
   ↓
Hourly limit available?
   ├── Yes → send email
   │
   └── No
        ↓
      reschedule
        ↓
      Slack notification
Recovery Flow
Backend starts
      ↓
Find PROCESSING emails
      ↓
Recover interrupted work
      ↓
Find SCHEDULED emails
      ↓
Check corresponding BullMQ jobs
      ↓
Missing job?
   ├── No → continue
   └── Yes → recreate job
      ↓
Worker processes normally
Project Structure
reachinbox-email-scheduler/
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   │
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── scripts/
│   │   ├── workers/
│   │   └── server.ts
│   │
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── types/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   │
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml
├── README.md
└── .gitignore
Technologies
Layer	Technology
Frontend	React + TypeScript
Build tool	Vite
Styling	Tailwind CSS
Backend	Node.js + Express
Database	PostgreSQL
ORM	Prisma
Queue	BullMQ
Cache / Rate limiting	Redis
Search	Elasticsearch
Authentication	Google OAuth
Notifications	Slack OAuth
SMTP	Ethereal
Queue dashboard	Bull Board
Containers	Docker
Environment Variables

Create a .env file inside backend/.

PORT=5000

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/reachinbox?schema=public"

REDIS_URL="redis://localhost:6379"

ELASTICSEARCH_URL="http://localhost:9200"

WORKER_CONCURRENCY=5
MIN_DELAY_MS=2000
MAX_EMAILS_PER_HOUR=100

SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback

SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=

JWT_SECRET=

FRONTEND_URL=http://localhost:5173

Never commit .env or OAuth secrets.

Running the Project
Start infrastructure
docker compose up -d

This starts PostgreSQL, Redis, and Elasticsearch.

Backend
cd backend
npm install
npx prisma generate
npm run dev
Worker

Open another terminal:

cd backend
npm run worker
Frontend

Open another terminal:

cd frontend
npm install
npm run dev

Frontend:

http://localhost:5173

Backend:

http://localhost:5000

Bull Board:

http://localhost:5000/admin/queues
Testing
Authentication
Open the frontend.
Click Continue with Google.
Complete Google authentication.
Verify the dashboard loads with the authenticated user's information.
Email scheduling
Open Compose New Email.
Enter a subject and message.
Upload a CSV, TXT, or PDF file.
Verify the number of unique email addresses detected.
Select a future date/time.
Configure delay and hourly limit.
Schedule the campaign.
Verify jobs in Bull Board.
Rate limiting

For a controlled test:

Hourly limit = 2

Schedule multiple emails.

Expected:

Email 1 → SENT
Email 2 → SENT
Rate limit → Slack notification
Email 3 → DELAYED
Bulk scheduling

A 1000-recipient CSV can be scheduled using one bulk API request.

Expected:

count = 1000
jobsCreated = 1000
Search

Use the dashboard search field to search by email or subject.

Recovery

Restart the backend while scheduled work exists.

The startup reconciliation process checks PostgreSQL against BullMQ and recreates missing jobs.

Important Implementation Details
Bulk scheduling

The application uses a single bulk request instead of making one HTTP request per recipient.

1000 recipients
      ↓
1 API request
      ↓
createMany()
      ↓
addBulk()
      ↓
1000 jobs
Rate limiting

Redis is used because the sending limit must be shared across concurrent workers.

PostgreSQL

PostgreSQL is the persistent source of truth for email records and their states.

Elasticsearch

Elasticsearch provides fast email search without using PostgreSQL for full-text search.

Ethereal

Ethereal is used as a development SMTP service. It provides preview URLs for testing instead of delivering messages to real inboxes.

Security
Google OAuth authentication
OAuth state validation
HttpOnly authentication cookie
Protected API routes
JWT verification
User ownership checks
Secrets stored in environment variables
.env excluded from Git
Development Notes

This project is intended for development/demo use with Ethereal SMTP.

Before a production deployment, additional infrastructure would normally include:

HTTPS
production SMTP provider
encrypted secret management
structured logging
monitoring
distributed worker deployment
stronger request validation
database/queue transaction coordination
Status

Core functionality implemented:

Google authentication
Slack integration
Email scheduling
Delayed delivery
Bulk scheduling
Redis rate limiting
Automatic rescheduling
Worker concurrency
Email search
CSV/TXT/PDF lead processing
Restart recovery
Dashboard
Bull Board monitoring

Save it with:

```text
Ctrl + S
Step 2: Make sure .gitignore is correct

At the project root, open or create:

.gitignore

Use:

node_modules/
.env
.env.*
!.env.example

dist/
build/

.vscode/
.idea/

*.log

.DS_Store
Thumbs.db

This is important because your Google and Slack secrets should never end up on GitHub.

Step 3: Don't commit your 1000-email test CSV

Your generated file:

frontend/test-1000.csv

should not be committed.

Add this to .gitignore:

frontend/test-1000.csv

Also add your small local test files if they contain test addresses:

frontend/test-leads.csv
frontend/test-leads.txt
frontend/test-leads.pdf
Step 4: Check the project root

You should now have:

reachinbox-email-scheduler/
├── backend/
├── frontend/
├── docker-compose.yml
├── .gitignore
└── README.md