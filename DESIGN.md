---
name: จองที่พักภาคสนาม (Field Housing Booking Console)
description: A bold-outline, flat-cartoon "sticker sheet" internal Operate tool for CJ Mart field-team housing approvals
colors:
  bg: "#E4F6F8"
  surface: "#FFFFFF"
  surface-2: "#FFF6DE"
  surface-3: "#FDE8B8"
  line: "#E6E8ED"
  ink: "#17181C"
  ink-soft: "#53555C"
  ink-faint: "#8B8E98"
  accent: "#FF6A3D"
  accent-deep: "#E14F22"
  accent-soft: "#FFE1CE"
  success: "#2FB24A"
  success-deep: "#1E8536"
  success-soft: "#D8F2DD"
  danger: "#F0453B"
  danger-deep: "#C62E27"
  danger-soft: "#FCDAD6"
  warning: "#FFC22B"
  warning-deep: "#C6890A"
  warning-soft: "#FFF0C4"
  info: "#2CA6D8"
  info-deep: "#1C7CA3"
  info-soft: "#D6F0FA"
typography:
  display:
    fontFamily: "Mitr, IBM Plex Sans Thai, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "IBM Plex Sans Thai, Noto Sans Thai, system-ui, sans-serif"
    fontWeight: 400
  data:
    fontFamily: "IBM Plex Mono, monospace"
    fontVariantNumeric: "tabular-nums"
rounded:
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "20px"
  icon-badge:
    rounded: "26%"
    padding: "0"
  pill-badge:
    rounded: "{rounded.pill}"
    padding: "5px 11px"
---

## Overview

An internal CJ Mart tool that coordinates hotel bookings for traveling field teams (store setup crews and activity/event crews) across two independent approval lines, used on a phone between tasks. The surface stays a disciplined Operate tool at its core (task, state, and affordance never obscured), but its skin is a fully-committed "sticker sheet": every shape — card, button, input, icon, avatar — carries a heavy black (or, in dark mode, near-white) outline and a flat saturated fill, per two rounds of user-pinned references: an illustrated travel-app mockup (round one, superseded) and a bold-outline flat travel-icon set plus an underwater/beach cartoon mood board (round two, current). The rendition draws only the *mood* from the second reference — bold outline, saturated flat color, whimsical linework — never its literal characters or copyrighted scenes; all illustrated subjects were re-authored for this product's own domain (a branch storefront, a suitcase, a route, a checkmark badge).

## Colors

- **Ground:** a pale sea-blue (`--bg`), evoking the beach/outdoor mood without competing with content.
- **Surfaces:** white (`--surface`) for cards — chosen because bold black outlines and saturated fills read cleanest against pure white, not a tinted ground. A pale yellow-cream (`--surface-2`) carries secondary chrome (tabbar, chip backgrounds).
- **Five saturated hues, each a whole icon badge's fill, never just a text tint:** coral-orange `--accent` (primary actions, briefcase/users/copy/hotel icons), sea-blue `--info` (search/calendar-adjacent icons, map muster markers), leaf green `--success` (check/done states, map hotel markers), gold `--warning` (clock/alert/package icons, map branch markers), red `--danger` (x/reject/calendar icons). Every semantic color stays in this same saturated family — no muted/desaturated variants — because the whole point of the world is that color is confident, not restrained.
- **The outline color is `--ink` itself**, which is why it can double as body text: near-black in light mode, near-white/cream in dark mode. This single token is what lets every bordered shape (cards, buttons, icon badges, avatars, inputs) relight correctly in both themes without a second dark-mode outline color to maintain.
- Dark mode is a true "night" rendition: deep navy-black ground (`#0F1620`), the same five hues lightened for legibility, outlines flip to near-white so the sticker-sheet look survives the theme switch rather than just inverting to gray.
- Map markers (Leaflet) and the driving-route line are hardcoded hex twins of `--info`/`--warning`/`--success`/`--accent` (Leaflet can't consume CSS custom properties), kept in sync by hand if the palette ever changes.

## Typography

- **Mitr** carries all display type — kept from the previous iteration because its rounded, geometric letterforms already suit a playful bold-outline world; no reason to introduce a second display face.
- **IBM Plex Sans Thai** carries all body copy — required for correct Thai glyph rendering; no substitute with equivalent Thai coverage exists among display faces with more "personality."
- **IBM Plex Mono** stays reserved for data: employee codes, distances, timestamps.

## Layout

Unchanged from the prior iteration: container-query driven (`container-type: inline-size` on `.app-shell`), mobile stacks to one column, ≥861px unlocks multi-column grids and the approver queue's list+detail split. Stat grids default to 2 columns (`.snap-grid`) with a 4-column variant (`.snap-grid-4`) gated behind the same breakpoint — never an inline `grid-template-columns` override, which previously broke the dashboard's mobile layout and was fixed during the first redesign pass.

## Elevation & Depth

- Shadows are **flat offset shadows**, not soft blurred ones: `3px 4px 0 rgba(ink, .16)` for resting elements, a smaller `2px 2px 0` for tight tiles, a larger `5px 6px 0` for popovers. This is the "sticker lifted slightly off the page" read that a soft blurred shadow cannot produce, and it is earned here specifically because the pinned reference is unambiguously in the flat/outline family — this is not a default reached for casually.
- Interactive elements (`.btn`, `.mission-btn`, `.role-btn`, `.trav-card`) use the offset shadow as their *resting* state and **remove it on hover/press** (`transform: translate(1px,1px); box-shadow:none`), reading as a physical button being pushed down onto the page — the shadow disappearing IS the interaction feedback, not a separate hover effect layered on top.

## Shapes

- **A `--bw: 3px` outline is the throughline.** Every card, button, input, combo-box, avatar, snap tile, and icon badge carries it in `var(--ink)`. Internal dividers (dashed rows inside a card, table row separators) stay on the softer `--line` token and are never bolded — bold outline marks an outer shape boundary, not every line in the UI.
- Radii are moderate, not maximal: 12/16/20/24px — pulled in from the previous iteration's 14–30px range because a fully-committed thick black outline reads as "sticker/comic panel" at a more moderate radius; pushed to max pill radius, it started looking soft again, undercutting the outline. Buttons, pills, inputs, and the search/combo box stay full `999px` pill — that is the one shape kept at maximum roundness, inherited from both pinned references.
- **Icons are flat "sticker" badges, not line icons** (a deliberate departure from the first redesign's Feather-derived stroke icons): a colored rounded-square badge (or, for the location pin, a teardrop) with a heavy black outline and a simple white pictogram inside, authored as inline SVG (`ICON_DEFS`/`icon()` in `app.js`) — 16 concepts covering every functional icon this app uses (search, pin, users, clock, check, alert, x, hotel, briefcase, calendar, copy, package, bed, undo, moon, home). No emoji glyphs anywhere in the codebase.
- Illustrations (login hero, role-pick backdrop blob, empty states) are flat two-tone-plus-outline scenes, hand-authored per this product's own subject matter (storefront, suitcase, route, checkmark badge) rather than literal travel/tourism or underwater imagery — the reference supplied the *technique*, this product supplied every *subject*.

## Components

- **`.btn` family:** pill-shaped, 3px ink outline, flat fill per variant, offset shadow that flattens on press. `.btn-ghost` drops border and shadow entirely for inline text-actions.
- **`.pill` badges:** status indicators — soft semantic background, a 2px border in the matching *-deep* color (not the base hue, which would be too close to the background for contrast), a small leading dot.
- **`.combo`:** the search/select pattern (branch search, staff search, guest search) — now a full pill shape with a 3px outline, leading badge-style icon, expanding into a bordered `.combo-list` dropdown on focus.
- **`.snap` stat tiles:** an icon badge (self-colored, no wrapping background needed since the badge already carries its own fill+outline) + a mono numeral + a label.
- **`.empty-state`:** illustration + bold title + soft subtitle; reserved for the two highest-traffic empty states (booker's own bookings, approver's queue) — smaller empty states stay plain `.empty-hint` text by design.
- **`.trav-card`:** the request-summary card pattern — 3px-outlined card, avatar/title/status-pill header, a dashed-divider meta row using the badge icon set.
- **Map markers & route:** circleMarker fills in `--info`/`--warning`/`--success` (muster/branch/hotel respectively), driving route in `--accent`; kept as literal hex since Leaflet can't read CSS variables.

## Do's and Don'ts

- **Do** give every new icon the same treatment: a colored rounded-square (or shape-specific silhouette) badge, a `var(--ink)`-colored ~7-unit outline (in the icon's own 100-unit viewBox), and a simple white pictogram — never a bare stroke-only line icon again, and never an emoji.
- **Do** keep the outline color tied to `var(--ink)` specifically, not a separate hardcoded black/white — that binding is what makes every outlined shape re-theme correctly in dark mode for free.
- **Do** let interactive elements "press" by dropping their offset shadow and nudging 1px on hover — that is this world's one authored motion moment; don't add a second, different hover effect on top of it.
- **Do** keep illustrated subjects tied to this product's own domain (housing, travel-for-work, approvals) even when the visual *technique* is borrowed from a mood reference; never reproduce a reference's literal copyrighted characters, scenes, or branding.
- **Don't** soften the outline weight "for a calmer look" on a one-off screen — 3px on outer shapes is the signature; a thinner border on a single new component reads as a different, unfinished product.
- **Don't** reach for a soft blurred shadow on a new element — this world's depth system is the flat offset shadow that flattens further on press; a blurred shadow here is a tell that the wrong reference got carried over.
- **Don't** introduce a second saturated hue beyond the five (`accent`/`info`/`success`/`warning`/`danger`) — spread further variety through which of the five an icon/badge uses, not through new colors.
