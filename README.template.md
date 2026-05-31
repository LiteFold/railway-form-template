# Eary Form

Self-hosted, privacy-first contact form backend with CAPTCHA anti-spam and HTMX admin dashboard.

## Live Example

See it in action: [Contact Page](https://all-that-recipe.blogspot.com/p/contact.html)

## Features

- **Embeddable forms** — Add a contact form to any site with a single HTML snippet
- **HTMX-powered admin** — No page reloads, smooth SPA-like experience without JavaScript frameworks
- **Spam protection** — Cap CAPTCHA integration, honeypot fields, and rate limiting
- **Privacy-first** — Your data stays on your server. No third-party trackers or analytics
- **Export data** — Download submissions as CSV
- **Email notifications** — SMTP or SendGrid integration for new submission alerts
- **Database-backed** — PostgreSQL for reliable storage
- **One-click deploy** — Deploy on Railway with a single click

## Services

| Service | Description |
|---------|-------------|
| Form API | FastAPI backend serving the admin dashboard and public form endpoints |
| PostgreSQL | Database for forms and submissions |
| Cap CAPTCHA | CAPTCHA service for spam protection |
| Valkey | Redis-compatible in-memory store for rate limiting |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-provided by Railway plugin) |
| `ADMIN_PASSWORD` | No | Password for admin dashboard login |
| `SESSION_SECRET_KEY` | No | Secret for session signing (auto-generated if not set) |
| `CAP_ENDPOINT` | No | Cap CAPTCHA service endpoint |
| `RATE_LIMIT` | No | Max submissions per IP per hour (default: 10) |

# Deploy and Host

## About Hosting

Eary Form is designed to run on Railway. It uses PostgreSQL for data storage, Cap CAPTCHA for spam protection, and Valkey for rate limiting — all available as Railway plugins. The FastAPI backend is automatically built with Nixpacks and requires zero configuration beyond setting your admin password.

## Why Deploy

Most contact form solutions (Google Forms, Typeform, etc.) send your visitors' data to third parties. Eary Form keeps everything on your own infrastructure — your submissions, your rules, your uptime. Perfect for privacy-conscious businesses, developers who want full control, or anyone tired of pay-per-submission pricing models.

## Common Use Cases

- **Personal website contact forms** — Embed a form on your portfolio or blog
- **Business lead capture** — Collect inquiries without third-party data sharing
- **Support ticket intake** — Simple submission form with admin dashboard to track and manage entries
- **Self-hosted alternative** — Replace Google Forms, Typeform, or Jotform for privacy-sensitive use cases
- **Blogger integration** — Add a contact form to your Blogger blog without JavaScript frameworks (see live example)

## Dependencies for

### Deployment Dependencies

- PostgreSQL (auto-provisioned via Railway plugin)
- Cap CAPTCHA (deployed as a separate service)
- Valkey (deployed as a separate service for rate limiting, Redis-compatible)

## Getting Started

1. Deploy this template on Railway
2. The PostgreSQL database is automatically provisioned
3. Set `ADMIN_PASSWORD` to secure your admin dashboard
4. Access the admin dashboard at `/admin`
5. Create your first form and grab the embed snippet from the homepage
