# Add Input Size Limits Per Field Type

## Problem
The admin form builder does not allow setting size limits on field inputs. The public form renders inputs without `maxlength`, `min`/`max`, or `rows` attributes. This means:
- Users can submit arbitrarily long text
- No front-end validation for field-specific limits
- No way to constrain number ranges

## Current State
Field data model (line 268):
```javascript
{name: 'field1', label: 'Field 1', type: 'text', required: false, placeholder: ''}
```

Public form renders (public_form.html, lines 155-180):
- text/email/tel/number/url → `<input type="{{ field.type }}">` — no maxlength, no min/max
- textarea → `<textarea>` — no rows/cols
- select → `<select>` with options
- checkbox → `<input type="checkbox">`

## Changes

### 1. Admin Builder — Extend Field Data Model
**File: `app/templates/admin_forms.html`**

Add field-specific properties to the field card render:

- **For text, email, tel, url types**: Add a "Max Length" number input
- **For number type**: Add "Min" and "Max" number inputs  
- **For textarea type**: Add "Rows" number input (default 5)

**Line 268** — Update default field creation:
```javascript
fields.push({
  name: 'field' + (fields.length+1),
  label: 'Field ' + (fields.length+1),
  type: 'text',
  required: false,
  placeholder: '',
  maxlength: '',
  min: null,
  max: null,
  rows: null
});
```

**In render() function (lines 148-180)** — After the Placeholder row, add a conditional row:
- For type text/email/tel/url → show "Max Length" input
- For type number → show "Min" + "Max" inputs
- For type textarea → show "Rows" input

Use data-field-key for the new fields: `maxlength`, `min`, `max`, `rows`.

### 2. Public Form — Render Attributes
**File: `app/templates/public_form.html`**

- For text/email/tel/url inputs: add `maxlength="{{ field.maxlength }}"` if set
- For number inputs: add `min="{{ field.min }}"` `max="{{ field.max }}"` if set
- For textarea: add `rows="{{ field.rows }}"` if set (default 5)

### CSS (optional)
**File: `app/templates/admin_forms.html`** (inline style block)
Add rule for the new size limit inputs to match field-card styling:
```css
.field-card-row input[type="number"] {
  width: 80px;
}
```

## Verification
1. Create a new form, add a text field → "Max Length" input should appear in the card
2. Change type to number → "Min" and "Max" inputs should replace "Max Length"
3. Change type to textarea → "Rows" input should appear
4. Change type to select/checkbox → no size limit inputs (current behavior)
5. Fill in values, save the form, view the public form → inputs should have the correct HTML attributes
6. `npx playwright test` — all existing tests must pass
