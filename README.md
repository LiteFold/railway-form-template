---
title: Easy Form
description: Self-hosted form and lead-capture backend with PostgreSQL storage, analytics, an HTMX admin dashboard, an MCP server for AI assistants, and optional email forwarding. Deploy on Railway in one click.
tags:
  - fastapi
  - python
  - postgresql
  - analytics
  - htmx
  - mcp
---

# Easy Form

> A self-hosted form and lead-capture backend with analytics, an HTMX admin dashboard and an MCP server. Two services (app + Postgres). Deploy on Railway in one click.

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
│  ┌───────────────────┐    ┌──────────────────┐  │
│  │  FastAPI backend  │────│   PostgreSQL     │  │
│  │  forms · admin    │    │   (asyncpg)      │  │
│  │  analytics · /mcp │    └──────────────────┘  │
│  └─────────┬─────────┘                          │
│            ▼                                    │
│   ┌────────────────┐                            │
│   │ SendGrid / SMTP│ (optional)                 │
│   └────────────────┘                            │
└─────────────────────────────────────────────────┘
        ▲                        ▲
        │ GET /admin             │ POST /mcp (API key)
 ┌──────┴───────────┐     ┌──────┴───────────┐
 │  Admin Dashboard │     │ AI assistant     │
 │  (HTMX-powered)  │     │ (Claude, etc.)   │
 └──────────────────┘     └──────────────────┘
```

## What It Does

- **Receive form submissions** from your static site, blog, or any HTML page
- **Block spam** with an invisible honeypot field and per-IP rate limiting
- **Store submissions** in PostgreSQL for review
- **Notify you** via email (SendGrid or SMTP)
- **Admin dashboard** to view, search, and manage submissions (HTMX-powered, no page reloads)
- **Analytics** — trends, world map of where people filled in, per-field answer breakdowns and custom charts
- **MCP server** — let an AI assistant create forms and query leads and analytics

## Service Architecture

This template uses 2 services — both wired and ready on deploy:

1. **Form API** — The FastAPI backend (this repository)
2. **PostgreSQL** — Database for submissions and form definitions

`DATABASE_URL` is wired automatically with a reference variable. `ADMIN_PASSWORD`, `SESSION_SECRET_KEY` and `MCP_API_KEY` are generated on deploy.

## Live Example

See Eary Form in action on a real site: [Contact Page](https://all-that-recipe.blogspot.com/p/contact.html)

This Blogger blog embeds the form and accepts submissions live — no page reload, no third-party data sharing.

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
| `CAPTCHA_MODE` | ❌ | `auto` (template sets `honeypot`) | Spam protection mode (`honeypot`, `pow`, `off`, `auto`, `cap`) |
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

No CAPTCHA widget, no extra services:

| Layer | Method | Description |
|-------|--------|-------------|
| 1 | **Honeypot** | Hidden form field that bots fill in but humans don't see. Included in the hosted form and the embed snippet. |
| 2 | **Rate limit** | Per-IP cap on submissions (`RATE_LIMIT`, default 10). |
| 3 | **PoW** (optional) | Built-in proof-of-work challenge (SHA-256). Enable with `CAPTCHA_MODE=pow`. |

`CAPTCHA_MODE` accepts `honeypot` (template default), `pow`, `off`, or `auto`. If you run your own Cap server you can still point `CAP_ENDPOINT` / `CAP_SECRET_KEY` at it; it is no longer part of the Railway template.

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
