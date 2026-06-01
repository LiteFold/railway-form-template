# Hard-code Input Limits Per Field Type

Enforce type-appropriate size limits on public form inputs and backend validation. Not configurable in admin UI.

## Defaults

| Type   | Frontend Attribute    | Value      |
|--------|----------------------|------------|
| text   | `maxlength="500"`    | 500        |
| email  | `maxlength="254"`    | 254 (RFC 5321) |
| tel    | `maxlength="20"`     | 20         |
| url    | `maxlength="2000"`   | 2000       |
| number | `min="0"` `max="999999999"` | 0 / 999999999 |
| textarea | `rows="5"`        | 5          |
| select | —                    | —          |
| checkbox | —                   | —          |

## Changes

### 1. Public Form Template
**File: `app/templates/public_form.html`** (~lines 155-180)

Add HTML attributes to each input/textarea based on field.type:

**textarea:**
```html
<textarea name="{{ field.name }}" placeholder="{{ field.label }}" rows="5"{% if field.required %} required{% endif %}></textarea>
```

**text/email/tel/url:**
```html
<input type="{{ field.type }}" name="{{ field.name }}" placeholder="{{ field.label }}" maxlength="500"{% if field.required %} required{% endif %}>
```
With type-appropriate maxlength values (500/254/20/2000).

**number:**
```html
<input type="number" name="{{ field.name }}" placeholder="{{ field.label }}" min="0" max="999999999"{% if field.required %} required{% endif %}>
```

### 2. Backend Validation
**File: `app/main.py`** — in `submit_form()` (~lines 135-170)

After collecting submission_data, add validation per field type:

```python
# Enforce input limits per type
for field in form_def["fields"]:
    fname = field.get("name")
    if fname not in submission_data:
        continue
    val = submission_data[fname]
    ftype = field.get("type", "text")
    
    limits = {
        "text": 500,
        "email": 254,
        "tel": 20,
        "url": 2000,
    }
    maxlen = limits.get(ftype)
    if maxlen is not None and len(val) > maxlen:
        if _wants_html(request):
            return HTMLResponse(status_code=200, content=f'<div ...>Field "{field.get("label", fname)}" exceeds maximum length of {maxlen}</div>')
        raise HTTPException(status_code=400, detail=f"Field '{field.get('label', fname)}' exceeds maximum length")
    
    if ftype == "number":
        try:
            num = int(val)
            if num < 0 or num > 999999999:
                raise ValueError
        except (ValueError, TypeError):
            if _wants_html(request):
                return HTMLResponse(status_code=200, content=f'<div ...>Field "{field.get("label", fname)}" must be between 0 and 999999999</div>')
            raise HTTPException(status_code=400, detail=f"Field '{field.get('label', fname)}' must be between 0 and 999999999")
```

### 3. Embed Snippet
**File: `app/templates/embed_snippet.html`** — same attribute additions as public_form.html for the preview snippet.

## Files to Modify
- `app/templates/public_form.html` — add HTML attributes
- `app/templates/embed_snippet.html` — add HTML attributes
- `app/main.py` — add backend validation

## Verification
1. Load a public form → text input should have `maxlength="500"`, number should have `min="0" max="999999999"`
2. Submit with overly long text → backend should return 400
3. Submit number with negative value → backend should return 400
4. `npx playwright test` — all existing tests must pass
