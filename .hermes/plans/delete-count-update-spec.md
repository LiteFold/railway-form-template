# Spec: Update total submissions count when a submission is deleted

## Problem

When a submission is deleted, the row is removed via HTMX swap (`hx-target="closest tr" hx-swap="outerHTML swap:1s"`), but the "X total submissions" count in the dashboard header is never updated — it's outside the swap target area.

## Fix

Two approaches — pick one:

### Option A: HTMX OOB swap (recommended — keeps smooth animation)

1. **app/templates/admin_dashboard.html line 62** — Add `id="total-count"` to the total count element:
```html
<p id="total-count">{{ total }} total submissions</p>
```

2. **app/admin.py delete_submission route (line 241)** — After deletion, query the new total and return an OOB element:
```python
async with pool.acquire() as conn:
    await conn.execute("DELETE FROM submissions WHERE id = $1", sub_id)
    new_total = await conn.fetchval("SELECT COUNT(*) FROM submissions") or 0

# Return empty element for normal swap (removes the target row)
# plus OOB element to update the total count
return HTMLResponse(
    content=f'<tr></tr><span id="total-count" hx-swap-oob="true"><p>{new_total} total submissions</p></span>',
    status_code=200,
)
```

The `<tr></tr>` replaces the deleted row (normal swap, effectively removes it).  
The `<span hx-swap-oob="true">` updates the total count (out-of-band swap).

### Option B: HX-Refresh (simpler — loses smooth animation)

Change the return value in `admin.py` line 241:
```python
# Before:
return HTMLResponse(status_code=200, content="")

# After:
return Response(status_code=200, headers={"HX-Refresh": "true"})
```

This forces a full page refresh, updating the count. The 1-second fade-out animation is replaced with a full page reload.

## Verification

1. Open admin dashboard — note total count
2. Delete a submission — row should disappear and total count should decrement
3. Verify count matches actual number of submissions in the DB
