# Spec: Hide slug error on input change

## Problem

When a user submits a form with a duplicate slug, a red error message appears below the slug input. But the error persists even after the user starts typing a corrected slug — they have to submit again to see if it's fixed.

## Fix

### `app/templates/admin_forms.html`

Add an `oninput` handler to the slug input that hides the error div when the user types:

```html
<input type="text" name="slug" id="slug" value="{{ editing_form.get('slug', '') }}" required
  {{ 'readonly' if editing_form.get('id') }}
  oninput="document.getElementById('slug-error')?.classList.add('hidden')">
```

And add an `id="slug-error"` to the error div, plus a CSS class for `.hidden`:

```html
{% if slug_error %}
<div id="slug-error" style="color:#ef4444;font-size:0.8125rem;margin-top:4px;">{{ slug_error }}</div>
{% endif %}
```

The `.hidden` class can be inline: `display:none` or added via the existing admin CSS.

Simpler approach — use inline style directly in the oninput:

```html
oninput="var e=document.getElementById('slug-error');if(e)e.style.display='none'"
```

This way no CSS changes needed — just one-line JS on the input and an id on the error div.

## Verification

1. Submit a form with a duplicate slug — error appears below slug input
2. Start typing in the slug input — error should disappear immediately
3. Submit again with another duplicate — error should reappear
4. Typing again should hide it again
