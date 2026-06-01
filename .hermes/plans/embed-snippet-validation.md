# Add On-the-Fly Validation to Embed Snippet

## Goal
The embed snippet page (`embed_snippet.html`) generates copy-paste HTML for external sites. The generated form HTML must include inline validation CSS and JS so that when embedded on sites like Blogger, inputs validate on-the-fly.

## What to change

**File: `app/templates/embed_snippet.html`**

### 1. Add a new JS function `getValidationSnippet()`
Returns a string containing:
- An inline `<style>` block with CSS for `.field-error`, `.field-error-hidden`, `input.error`, `textarea.error`
- An inline `<script>` block that:
  - On DOMContentLoaded, selects all `form input` and `form textarea` elements
  - Creates an error `<span>` after each input
  - On `input` and `blur` events: validates email (regex), tel (digits/dash/parens), url (starts with http/https), number (parseFloat)
  - Shows/hides the error span and toggles `.error` class on the input

### 2. Include it in the generated snippet HTML
In `updateSnippet()`, concatenate `getValidationSnippet()` at the end of the generated HTMX snippet HTML string.

## Files to modify
- Only `app/templates/embed_snippet.html`

## Verification
1. Visit `/embed` in admin, select a form with email field
2. Copy the generated snippet
3. The snippet should contain both `<style>.field-error{...}</style>` and the validation `<script>`
4. Pasted on an external page, typing "notanemail" in the email field shows the error inline
