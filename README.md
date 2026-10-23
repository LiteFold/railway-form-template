---
title: Easy Form
description: Self-hosted contact form with anti-spam (Cap CAPTCHA), PostgreSQL storage, HTMX admin dashboard, and optional email forwarding. Deploy on Railway in one click.
tags:
  - fastapi
  - python
  - postgresql
  - captcha
  - htmx
  - valkey
---

# Easy Form

> A self-hosted contact form with Cap CAPTCHA anti-spam and HTMX admin dashboard. Deploy on Railway in one click.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.com/deploy/form-cap)

```text
┌─────────────────────────────────────────────────┐
│                   Your Website                   │
│  ┌───────────────────────────────────────────┐  │
│  │         Embedded Contact Form             │  │
│  │  Name: [________]  Email: [________]      │  │
│  │  Message: [___________________________]   │  │
│  │  [Send]                                   │  │
│  └──────────┬────────────────────────────────┘  │
└─────────────┼────────────────────────────────────┘
              │ POST /form/{slug}
              ▼
┌─────────────────────────────────────────────────┐
│              Railway (this app)                  │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │
│  │  Cap     │──│  FastAPI  │──│   PostgreSQL   │ │
│  │ CAPTCHA  │  │  Backend  │  │  (asyncpg)     │ │
│  └────┬─────┘  └──────────┘  └────────────────┘ │
│       │                                            │
│  ┌────▼─────┐                                      │
│  │  Valkey  │                                      │
│  │ (Redis)  │                                      │
│  └──────────┘                                      │
│                    │                            │
│                    ▼                            │
│           ┌────────────────┐                    │
│           │ SendGrid / SMTP│ (optional)         │
│           └────────────────┘                    │
└─────────────────────────────────────────────────┘
              ▲
              │ GET /admin
     ┌────────┴────────┐
     │  Admin Dashboard │
     │  (HTMX-powered)  │
     └─────────────────┘
```

## What It Does

- **Receive form submissions** from your static site, blog, or any HTML page
- **Block spam** automatically via Cap (primary), honeypot, and proof-of-work (fallback chain)
- **Store submissions** in PostgreSQL for review
- **Notify you** via email (SendGrid or SMTP)
- **Admin dashboard** to view, search, and manage submissions (HTMX-powered, no page reloads)

## Service Architecture

This template uses 4 services — all wired and ready on deploy:

1. **Form API** — The FastAPI backend (this repository)
2. **Cap CAPTCHA** — Anti-spam CAPTCHA service from `tiago2/cap`
3. **PostgreSQL** — Database for submissions and form definitions
4. **Valkey** — Redis-compatible store for Cap session data (`valkey/valkey:8-alpine`)

Environment variables are pre-configured with reference variables — `DATABASE_URL`, `REDIS_URL`, `CAP_ENDPOINT`, and `CAP_SECRET_KEY` are all wired automatically.

## Live Example

See Eary Form in action on a real site: [Contact Page](https://all-that-recipe.blogspot.com/p/contact.html)

This Blogger blog embeds the form with CAPTCHA and accepts submissions live — no page reload, no third-party data sharing.

## Prerequisites

- A [Railway](https://railway.app) account
- A PostgreSQL database (Railway can provision one automatically)

## Quick Start

### 1. Deploy to Railway

Click the "Deploy on Railway" button above. Railway will:

1. Clone the repository
2. Detect the Python/FastAPI project (via Nixpacks)
3. Provision a PostgreSQL database
4. Deploy the app

### 2. Configure Environment Variables

After deployment, set these variables in Railway:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | Postgres connection string (auto-set by Railway) |
| `ADMIN_PASSWORD` | ✅ | — | Password for the admin dashboard |
| `CAPTCHA_MODE` | ❌ | `auto` | Spam protection mode (`auto`, `cap`, `honeypot`, `pow`) |
| `FORM_RECIPIENT_EMAIL` | ❌ | — | Where to forward submissions |
| `SENDGRID_API_KEY` | ❌ | — | SendGrid API key for email |
| `SMTP_HOST` | ❌ | — | SMTP host (fallback if SendGrid unset) |
| `SMTP_PORT` | ❌ | `587` | SMTP port |
| `SMTP_USER` | ❌ | — | SMTP username |
| `SMTP_PASS` | ❌ | — | SMTP password |
| `FROM_EMAIL` | ❌ | `noreply@contact-form.app` | Sender address |
| `RATE_LIMIT` | ❌ | `10` | Max submissions per IP per hour |
| `RATE_LIMIT_BACKEND` | ❌ | `memory` | `memory` or `db` |
| `MCP_API_KEY` | ❌ | — | Enables the MCP server at `/mcp` (see below) |
| `PUBLIC_BASE_URL` | ❌ | Railway domain | Base URL used in form links returned by MCP tools |

> **Note:** When deployed via the template, all database and service URLs are pre-configured. Only set `ADMIN_PASSWORD` (for the admin dashboard) and optional email settings.

### 3. Get Your Form Endpoint

Visit your app's URL (`https://your-app.railway.app/`) to see the embed snippet page with the correct endpoint URL.

### 4. Embed the Form

Copy the HTML snippet from the embed page and paste it into your website:

```html
<form action="https://your-app.railway.app/form/contact" method="post">
  <input type="text" name="name" placeholder="Your Name" required>
  <input type="email" name="email" placeholder="Your Email" required>
  <textarea name="message" placeholder="Message" required></textarea>
  <button type="submit">Send</button>
</form>
```

For HTMX-powered submission (no page reload):

```html
<form
  hx-post="https://your-app.railway.app/form/contact"
  hx-target="#form-response"
  hx-swap="innerHTML"
>
  <input type="text" name="name" placeholder="Your Name" required>
  <input type="email" name="email" placeholder="Your Email" required>
  <textarea name="message" placeholder="Message" required></textarea>
  <button type="submit">Send</button>
</form>
<div id="form-response"></div>
```

## Admin Dashboard

Access your admin dashboard at `https://your-app.railway.app/admin`

Features:
- **Submissions** — View all form submissions in a paginated table
- **Search** — Search across all submission data
- **Read/unread** — Toggle submission status
- **Delete** — Remove spam or old submissions
- **CSV Export** — Download all submissions as a CSV file
- **Forms** — Create and manage multiple form definitions
- **Custom fields** — Define your own form fields (text, email, textarea, tel, number, select, checkbox)

## Spam Protection

The app uses a three-layer anti-spam approach:

| Layer | Method | Description |
|-------|--------|-------------|
| 1 | **Cap** | Primary CAPTCHA provider. Simple, privacy-friendly alternative to reCAPTCHA. Uses Valkey (Redis-compatible) as its backing session store — included as the 4th service so it works out of the box. |
| 2 | **Honeypot** | Hidden form field that bots fill in but humans don't see. |
| 3 | **PoW** | Built-in proof-of-work challenge (SHA-256) as last resort. |

Set `CAPTCHA_MODE=auto` (default) to try each layer in order. Set it to `cap`, `honeypot`, or `pow` to pin a specific method.

## API Reference

### Submit a Form

```
POST /form/{slug}
Content-Type: application/x-www-form-urlencoded
```

Body: Form fields as defined in the form configuration.

Response (201):
```json
{"status": "ok", "message": "Form submitted successfully"}
```

### Health Check

```
GET /health
```

Response (200):
```json
{"status": "healthy", "database": "connected"}
```

### Get PoW Challenge

```
GET /pow-challenge?difficulty=4
```

Response:
```json
{"secret": "abc123...", "nonce": 42, "difficulty": 4}
```

## MCP Server (AI assistants)

The app includes a [Model Context Protocol](https://modelcontextprotocol.io) server at `/mcp`, so Claude or any MCP client can manage forms and leads in plain language — "create a lead form with name, work email and budget", "who filled the event form from India this week?", "ticket types per month for Q3".

1. Set `MCP_API_KEY` on the service (generate one with `python -c "import secrets; print(secrets.token_urlsafe(32))"`). The endpoint returns 503 until it is set.
2. Connect a client to `https://your-app.railway.app/mcp` (Streamable HTTP) with the header `Authorization: Bearer <MCP_API_KEY>` (or `X-API-Key`).

Claude Code:

```bash
claude mcp add --transport http easy-form https://your-app.railway.app/mcp --header "Authorization: Bearer YOUR_KEY"
```

| Tool | What it does |
|------|--------------|
| `list_forms`, `get_form` | Forms with fields, submission/unread counts and public URL |
| `create_form`, `update_form` | Build or edit forms (text, email, textarea, select, checkbox, tel, number, url) |
| `delete_form` | Delete a form and its submissions (requires `confirm=true`) |
| `list_submissions`, `get_submission` | Who filled a form — filter by form, text search, unread, country, date range |
| `mark_submissions_read`, `delete_submission` | Triage leads (delete requires `confirm=true`) |
| `get_analytics` | Totals vs previous period, trend, weekday/hour, countries, per-field answer breakdowns |
| `build_chart` | Cross-tabulate fields by day/week/month/weekday/hour/country, count/sum/avg |

## Blogger Setup

See [examples/blogger-embed.html](examples/blogger-embed.html) for a complete Blogger-compatible form with AJAX submission (no HTMX needed — Blogger doesn't support it).

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Copy env file
cp .env.sample .env
# Edit .env with your DATABASE_URL and ADMIN_PASSWORD

# Run locally
uvicorn app.main:app --reload --port 8000
```

## License

MIT
