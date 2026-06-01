# On-the-Fly Input Validation for Public Form

## Problem
Input validation only happens on form submit (server-side). Users type invalid data (wrong email format, letters in phone field) and get no feedback until they hit submit.

## Goal
Validate inputs as the user types — show/hide inline error messages in real-time.

## Changes

### File: app/templates/public_form.html

Add a `<script>` block before closing `</body>` (or inside `<head>`) with on-the-fly validation:

**Validation rules (client-side, match server-side logic):**

| Type | Check | Error message |
|------|-------|--------------|
| email | `[^@\s]+@[^@\s]+\.[^@\s]+` | "Please enter a valid email address" |
| tel | `[\d\s\-\+\(\)]{7,20}` (digits/dash/parens/plus only) | "Please enter a valid phone number" |
| url | starts with `http://` or `https://` | "Please enter a valid URL (http/https)" |
| number | `!isNaN(val)` or `parseFloat` succeeds | "Please enter a valid number" |
| text | maxlength (if set via FIELD_LIMITS or data attribute) | "Maximum X characters" |

**Implementation approach:**

1. On `input` event for each field, validate based on the field's `type` attribute
2. Show error in a small `<span class="field-error">` appended after the input
3. Style `.field-error` with red text, small font
4. Also validate on `blur` (when user leaves the field)
5. Clear error when field becomes valid

**CSS to add (inline in the template's style block):**
```css
.field-error {
  color: #dc2626;
  font-size: 0.8em;
  margin-top: 4px;
  display: block;
}
.field-error-hidden {
  display: none;
}
input.error, textarea.error {
  border-color: #dc2626;
}
```

**JavaScript approach:**
Keep it simple — no framework. Just attach event listeners in a DOMContentLoaded handler.

```javascript
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.form-card input, .form-card textarea').forEach(function(input) {
    const type = input.type || input.dataset.type;
    const errorSpan = document.createElement('span');
    errorSpan.className = 'field-error field-error-hidden';
    input.parentNode.insertBefore(errorSpan, input.nextSibling);
    
    function validate() {
      const val = input.value.trim();
      let error = '';
      if (val.length > 0) {
        if (type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
          error = 'Please enter a valid email address';
        } else if (type === 'tel' && !/^[\d\s\-+()]+$/.test(val)) {
          error = 'Please enter a valid phone number';
        } else if (type === 'url' && !/^https?:\/\/.+/.test(val)) {
          error = 'Please enter a valid URL (http/https)';
        } else if (type === 'number' && isNaN(parseFloat(val))) {
          error = 'Please enter a valid number';
        }
      }
      errorSpan.textContent = error;
      errorSpan.classList.toggle('field-error-hidden', !error);
      input.classList.toggle('error', !!error);
    }
    
    input.addEventListener('input', validate);
    input.addEventListener('blur', validate);
  });
});
```

## Files to modify
- `app/templates/public_form.html` — add JS + CSS

## Verification
1. Open public form, type "notanemail" in email field → "Please enter a valid email address" appears
2. Type a valid email → error disappears
3. Type "abc" in tel field → "Please enter a valid phone number" appears
4. Type "555-1234" → error disappears
5. Type "not-a-url" in url field → error appears
6. Type "https://example.com" → error disappears
7. Type "abc" in number field → error appears
8. Type "42" → error disappears
9. Existing tests (api.spec.js) still pass
