# Reading experience — design

Sub-project 1 of 4 from the user's 2026-09-28 request (order agreed: Reading → Reliability → Practice lab → Interviewer). The user picked reading-view improvements only. Sticky notes, flashcards and daily review were offered and **not** chosen.

## Constraints (user, 2026-09-28)

- Free, legal, secure.
- Works offline, and no new online services or accounts.
- No new npm/cargo dependencies are needed for this sub-project.

## 1. Text style "C · Crisp"

Chosen from a four-way visual comparison (A today / B book / C crisp / D compact). It applies to note content only (`.page-editor`), not the rest of the app.

| Property | Today | Crisp |
|---|---|---|
| Body size | 16.5px | 17px (still × `--reading-scale`) |
| Line height | 1.7 | 1.55 |
| Column width | 68ch | 72ch |
| Body text colour (light) | `--ink` oklch(0.22) | near-black, about oklch(0.15) |
| Background (light) | `--surface` | pure white |
| Headings | 650 weight | 700 weight, darker, thin bottom border under H1/H2 |
| Bold | inherits | explicitly 700 |

- **Dark mode** gets the same treatment in its own palette: body text brighter than today's `--ink` (about oklch(0.96)), 700-weight headings with a subtle bottom border using `--border`.
- **Implementation:** add reading-specific tokens (`--reading-ink`, `--reading-bg`, `--reading-heading-rule`) under both `:root` blocks rather than hard-coding colours, so both themes stay token-driven. The serif/sans toggle and zoom keep working on top.
- **Keep existing fixes intact:**
  - List markers sit on the same line as their text (paragraph-only spacing, commit `d5b8744`).
  - Code blocks use theme tokens (commit `5d3b980`).

## 2. Section jumping and find-in-note

The user picked "jump buttons + keys" out of four navigation aids. Not built: progress bar, smart outline, folding.

**What a "section" is.** A section starts at a heading block (H1–H3), plus any block that looks like a title when the note has no headings:
- a paragraph whose entire content is bold, **or**
- a paragraph of at most 60 characters, not ending in `.`, `,`, `;` or `:`, and followed by a non-empty block.

This lives in one pure function over BlockNote blocks, `findSectionStarts(blocks): string[]` (block ids), so it can be unit-tested.

**Floating buttons.** **↑ Top · ‹ Prev · Next ›** sit in the bottom-right of the editor pane.
- They show only when the note is taller than about 1.5 viewports.
- Prev and Next are disabled at either end.
- A button scrolls the block into view (`scrollIntoView({ block: "start" })`). It never moves the text cursor, so reading can't trigger an edit.

**Keys.** The editor is always editable, so single-letter keys are impossible (J would type "j").
- **Alt+↓ / Alt+↑:** next / previous section.
- **Ctrl+Home:** already native, unchanged.
- The Alt handlers must `preventDefault` so ProseMirror doesn't also act on the keys.

**Ctrl+F: find in note.**
- A small bar at the top of the editor pane: an input, an "n of m" count, ↑/↓ buttons, and Esc to close. Enter or Shift+Enter moves between matches.
- Matching is case-insensitive over the editor's rendered text.
- **Highlighting uses the CSS Custom Highlight API** (`CSS.highlights` plus `Range` objects, supported in WebView2/Chromium). No `<mark>` elements are inserted, so the ProseMirror document is never mutated and searching cannot change note content or trigger a save.
- The current match gets a stronger highlight colour and is scrolled into view.
- Ctrl+F is caught only while the editor pane is focused or hovered. Elsewhere in the app it does nothing, as today.

## 3. Touchpad pinch-to-zoom

- **Existing design:** Ctrl+wheel on the editor container changes `--reading-scale` between 0.8 and 2.0, with a non-passive listener and `preventDefault`. On Windows, precision-touchpad pinch reaches the page as Ctrl+wheel.
- **Problem:** the user reports pinch doesn't work, and the cause is unknown.
- **Implementation must diagnose before fixing.** Likely suspects:
  - The listener is attached only to `containerRef`, so a pinch while the pointer is over the outline rail or margins zooms nothing.
  - WebView2 handles the gesture itself.
  - Per-event steps are too small for the tiny fractional deltas a touchpad sends.
- **Goal:** pinch and Ctrl+scroll anywhere over the note zoom only the note, smoothly, and never the whole window.
- **Verification:** the user confirms by pinching. CDP can check that `--reading-scale` changes on a synthetic Ctrl+wheel.

## Out of scope

- Sticky notes, flashcards, spaced repetition, daily review (offered, not chosen).
- Any change to the notes data model, sync, or storage.

## Testing

- Unit tests (vitest) for `findSectionStarts`:
  - headings
  - bold-only lines
  - short title lines
  - long sentences excluded
  - a trailing title line with nothing after it excluded
  - an empty note
- Live checks over CDP on a real long note (e.g. "SQL", "Case"):
  - The buttons appear, and Next/Prev land on the expected blocks.
  - Alt+↓ doesn't insert text.
  - Ctrl+F counts the right number of matches and leaves `page_bodies.updated_at` unchanged.
  - Computed styles match style C in both themes.
- The user checks visually: the look in both themes, and pinch-to-zoom.
