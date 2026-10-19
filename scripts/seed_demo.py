"""Seed a demo form with realistic submissions for trying out the analytics page.

Usage:
    python scripts/seed_demo.py            # add ~900 submissions over the last 12 months
    python scripts/seed_demo.py --clear    # remove the demo form, its submissions and charts
"""
import argparse
import asyncio
import json
import os
import random
import sys
from datetime import datetime, timedelta, timezone

import asyncpg
from dotenv import load_dotenv

SLUG = "event-feedback"
TITLE = "Event Feedback"
FIELDS = [
    {"name": "name", "type": "text", "required": True, "label": "Your Name"},
    {"name": "email", "type": "email", "required": True, "label": "Email"},
    {"name": "ticket", "type": "select", "required": True, "label": "Ticket Type",
     "options": ["Free", "Standard", "VIP"]},
    {"name": "rating", "type": "select", "required": True, "label": "Rating",
     "options": ["1", "2", "3", "4", "5"]},
    {"name": "heard_from", "type": "select", "required": False, "label": "How did you hear about us?",
     "options": ["Twitter", "LinkedIn", "Friend", "Newsletter", "Search"]},
    {"name": "attendees", "type": "number", "required": False, "label": "Group Size"},
    {"name": "newsletter", "type": "checkbox", "required": False, "label": "Subscribe to newsletter"},
    {"name": "message", "type": "textarea", "required": False, "label": "Comments"},
]

COUNTRIES = {
    "US": 30, "IN": 18, "GB": 10, "DE": 8, "CA": 6, "FR": 5, "BR": 5, "AU": 4,
    "NL": 3, "JP": 3, "ES": 2, "SG": 2, "MX": 2, "ZA": 1, "NG": 1, "SE": 1, "AE": 1,
}
FIRST = ["Ava", "Liam", "Priya", "Noah", "Mia", "Arjun", "Sofia", "Lucas", "Emma", "Kenji", "Zara", "Omar"]
LAST = ["Shah", "Kim", "Patel", "Smith", "Garcia", "Müller", "Silva", "Tanaka", "Okafor", "Novak", "Rossi", "Dubois"]
COMMENTS = ["Great event!", "Loved the talks", "Venue was crowded", "", "", "Will come again", "Too short"]


def pick(weights: dict):
    return random.choices(list(weights), weights=list(weights.values()))[0]


def make_submission(now: datetime):
    days_ago = int(random.triangular(0, 365, 30))
    # weekday-heavy traffic, peaking in the afternoon
    created = now - timedelta(days=days_ago)
    while created.weekday() >= 5 and random.random() < 0.6:
        created -= timedelta(days=1)
    created = created.replace(hour=min(23, max(0, int(random.gauss(14, 4)))),
                              minute=random.randint(0, 59), second=random.randint(0, 59))
    ticket = pick({"Free": 50, "Standard": 35, "VIP": 15})
    rating = pick({"5": 35, "4": 30, "3": 18, "2": 10, "1": 7} if ticket != "VIP" else {"5": 60, "4": 30, "3": 10})
    first = random.choice(FIRST)
    name = f"{first} {random.choice(LAST)}"
    data = {
        "name": name,
        "email": f"{first.lower()}{random.randint(1, 999)}@example.com",
        "ticket": ticket,
        "rating": rating,
        "heard_from": pick({"Twitter": 20, "LinkedIn": 25, "Friend": 30, "Newsletter": 15, "Search": 10}),
        "attendees": str(max(1, int(random.expovariate(0.6)) + 1)),
        "message": random.choice(COMMENTS),
    }
    if random.random() < 0.45:
        data["newsletter"] = "yes"
    metadata = {"ip": "203.0.113.1", "user_agent": "seed", "referer": "", "country": pick(COUNTRIES), "seed": True}
    return created, data, metadata


async def main(clear: bool, count: int):
    load_dotenv()
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set")
    conn = await asyncpg.connect(url)
    try:
        if clear:
            await conn.execute("DELETE FROM submissions WHERE form_slug = $1", SLUG)
            await conn.execute("DELETE FROM analytics_charts WHERE form_slug = $1", SLUG)
            await conn.execute("DELETE FROM forms WHERE slug = $1", SLUG)
            print(f"Removed demo form '{SLUG}'")
            return
        await conn.execute(
            "INSERT INTO forms (slug, title, fields) VALUES ($1, $2, $3::jsonb) ON CONFLICT (slug) DO NOTHING",
            SLUG, TITLE, json.dumps(FIELDS),
        )
        now = datetime.now(timezone.utc)
        rows = []
        for _ in range(count):
            created, data, metadata = make_submission(now)
            rows.append((SLUG, json.dumps(data), json.dumps(metadata), created, random.random() < 0.7))
        await conn.executemany(
            "INSERT INTO submissions (form_slug, data, metadata, created_at, is_read) "
            "VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)",
            rows,
        )
        print(f"Inserted {count} submissions into '{SLUG}'")
    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--clear", action="store_true")
    parser.add_argument("--count", type=int, default=900)
    args = parser.parse_args()
    asyncio.run(main(args.clear, args.count))
