# Add Input Validation Per Field Type

## Problem
The public form accepts any input regardless of field type. Email fields accept junk, phone fields accept letters, number fields accept text. No format validation exists.

## Current State
- Server-side (main.py lines 148-171): only checks required + strip, no type validation
- Client-side (public_form.html line 173): only maxlength/min/max, no pattern attribute
- FIELD_LIMITS constant exists but unused server-side

## Supported Field Types That Need Validation
| Type | HTML5 pattern | Server-side check |
|------|--------------|-------------------|
| email | `[^@\s]+@[^@\s]+\.[^@\s]+` (basic) | regex or python validator |
| tel | `[\d\s\-\+\(\)]{7,20}` | digits/dash/parens/plus, 7-20 chars |
| url | `https?://.+` | must start with http:// or https:// |
| number | (native `type="number"`) | `isinstance(val, (int, float))` or try/parse |

## Changes

### 1. Server-side validation (app/main.py)
In submit_form(), after `val = val.strip()` and the required check, add:

```python
# Type-specific validation
field_type = field.get("type", "text")
if val and field_type == "email":
    import re
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', val):
        err = f'Invalid email format for "{field.get("label", fname)}"'
        return HTMLResponse(status_code=200, content=error_div(err))
        # (or raise HTTPException for JSON)
elif val and field_type == "tel":
    import re
    clean = re.sub(r'[\s\-\+\(\)]', '', val)
    if not clean.isdigit() or len(clean) < 7 or len(clean) > 20:
        err = f'Invalid phone number for "{field.get("label", fname)}"'
        return HTMLResponse(status_code=200, content=error_div(err))
elif val and field_type == "url":
    if not val.startswith(("http://", "https://")):
        err = f'Invalid URL for "{field.get("label", fname)}"'
        return HTMLResponse(status_code=200, content=error_div(err))
elif val and field_type == "number":
    try:
        float(val)  # validate it's a number
    except (ValueError, TypeError):
        err = f'Invalid number for "{field.get("label", fname)}"'
        return HTMLResponse(status_code=200, content=error_div(err))
```

### 2. Client-side HTML5 pattern (app/templates/public_form.html)
Add `pattern` attribute to inputs for browser-native validation:

```html
{% if field.type == 'email' %}
  pattern="[^@\s]+@[^@\s]+\.[^@\s]+" title="Enter a valid email address"
{% elif field.type == 'tel' %}
  pattern="[\d\s\-\+\(\)]{7,20}" title="Enter a valid phone number (7-20 digits)"
{% elif field.type == 'url' %}
  pattern="https?://.+" title="Enter a valid URL (http:// or https://)"
{% endif %}
```

### 3. Extract error_div helper (optional but clean)
The repeated `HTMLResponse(status_code=200, content=...)` is boilerplate. Could extract a helper or keep inline for consistency with existing pattern.

## Files to Modify
- `app/main.py` — add type validation in submit_form() loop
- `app/templates/public_form.html` — add pattern attributes

## Verification
1. Create form with email field → submit "notanemail" → see error "Invalid email format"
2. Create form with tel field → submit "abc" → see error "Invalid phone number"
3. Create form with url field → submit "not-a-url" → see error "Invalid URL"
4. Create form with number field → submit "abc" → see error "Invalid number"
5. Valid inputs still pass through
6. `npx playwright test` — all existing tests pass (may need to update E2E tests that send invalid data)
