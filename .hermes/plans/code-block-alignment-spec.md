# Spec: Fix code block alignment on embed page

## Problem

The two code blocks on the embed page (Embed Code and HTMX Embed) render at different widths because `.code-block-wrapper` has `align-items: flex-end`, which makes the `<pre>` shrink to content width instead of filling the container. Different content length → different block widths → misaligned copy buttons.

## Fix

### File: `app/static/admin.css`

**Change `.code-block-wrapper` (line 414):**

Remove `align-items: flex-end`. The button already has `align-self: flex-end` so it stays right-aligned. The `<pre>` will now stretch to fill the wrapper width (default flex behavior).

```css
.code-block-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;  /* ensure consistent width */
}
```

Also add `width: 100%` to the `<pre>` to guarantee it fills the wrapper:

```css
pre {
  width: 100%;
  ...
}
```

## Result

Both code blocks will have the same width (100% of container). The Copy buttons will sit at the same horizontal position below each block. Left edges line up. Right edges line up.

## Verification

1. Open `/` — both code blocks should be the same width
2. Left edges should be aligned
3. Right edges should be aligned  
4. Copy buttons should be at the same horizontal position
