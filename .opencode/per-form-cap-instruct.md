Implement the Per-form Cap CAPTCHA site keys feature described in .hermes/plans/per-form-cap-keys-spec.md.

Implement everything without asking for approval:

1. app/db.py: Add ALTER TABLE ADD COLUMN IF NOT EXISTS for cap_site_key VARCHAR(255) and cap_site_secret VARCHAR(255) to the forms table in init_db()

2. app/cap_api.py (NEW file): Create async function create_cap_site_key(name, endpoint, secret_key) that POSTs to {endpoint}/sitekey with Bearer auth header. Returns dict with site_key and secret_key on success, None on failure. Graceful degradation - catch all errors.

3. app/forms.py: In create_form(), after INSERT, auto-provision Cap site key via create_cap_site_key(). On success UPDATE the form row with cap_site_key and cap_site_secret. On failure log warning, don't fail.

4. app/captcha.py: Update verify_cap(token, secret_key=None) to accept optional per-form secret. Update verify_captcha(request, data, cap_secret_key=None) to pass it through.

5. app/main.py: In submit_form(), pass form_def.get('cap_site_secret') to verify_captcha().

6. app/templates/embed_snippet.html: Include cap_site_key in forms-data JSON per form. Static snippets use forms[0].cap_site_key or settings.cap_site_key. JS getCapSnippet() accept form parameter with per-form key.

7. app/templates/public_form.html: cap-widget uses form.cap_site_key or settings.cap_site_key.

After implementation, run: python -c 'from app.config import settings; from app.cap_api import create_cap_site_key; print("imports OK")'

Return structured report: files changed list, what changed per file, import check output.
