# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Internal CJ Mart staff only, used on desktop and mobile browsers during the workday — not a public or customer-facing app.

- **Bookers / branch coordinators** — create housing-booking requests on behalf of field teams: pick team, mission type, work branch, hotel, dates, and roster of guests staying.
- **Approvers (two separate lines)** — one approver for activity teams (ทีมกิจกรรม), one for setup teams (ทีม setup). Each reviews requests only in their own line: checks muster-point/branch/hotel distances against category-specific rules, approves or rejects with a reason, and later confirms the hotel booking with a confirmation number.
- **Employees (read-only)** — any staff member can look up their own upcoming stays by employee code.
- **Data admins** — the two approvers above, in an additional capacity: they maintain the underlying staff directory (add/edit/delete employee records) and replace the branch/hotel reference data via Excel upload. No separate admin role exists.

## Product Purpose

Coordinates and controls hotel bookings for CJ Mart's traveling field teams (store setup crews and activity/event crews), replacing an ad hoc process with one that: prevents double-bookings, enforces distance-based policy per team category (e.g. don't book a hotel if the muster point is already close enough to the work branch; don't pick a hotel too far from the branch without justification), routes every request through the correct approver, and gives visibility into how long approvals take and which plans could share a room/hotel.

## Positioning

Purpose-built for this company's actual field-operations rules (per-category distance thresholds, per-zone muster points, two independent approval lines) rather than a generic booking or expense tool — the validation logic encodes real operational policy that a generic tool would not know to enforce.

## Operating Context

- Two team categories with different rules: **activity teams** (ทีมกิจกรรม, organized by zone/province) and **setup teams** (ทีม setup, organized by named team). Each category has its own mission-type list, muster points, and distance thresholds.
- A booking request always carries: team category, mission type, traveling team, work branch, check-in/out dates, chosen hotel, and the roster of guests staying (drawn from the team's roster, another team's roster, or added ad hoc).
- Distance rules gate the flow: muster-point-to-branch distance decides whether a hotel booking is even allowed (hard block for setup, soft block requiring a written reason for activity, since activity teams' province-based zone doesn't always match an individual member's actual home); branch-to-hotel distance has a per-category radius, with hotels outside it requiring a justification note.
- Duplicate-booking prevention: a person already listed on an open (pending/approved) request elsewhere cannot be added to a new one.
- Approval flow: pending → approved/rejected → (if approved) done, once the booker enters the hotel's confirmation number. Rejection requires a typed reason.
- Supporting views: a cross-category analysis page suggesting when two open plans could share a hotel/room (overlapping dates, same or nearby hotel, matching leftover-gender counts), and a dashboard of real timestamps for measuring how long requests take to move through approval.
- Reference data (branches, hotels, staff, muster points) lives in the company's own Supabase project, shared with an older sibling booking system via table-name prefixing; staff/branch/hotel data originates from the company's real HR and store-network spreadsheets, periodically refreshed by hand.

## Capabilities and Constraints

- Plain Node/Express backend, static HTML/CSS/vanilla JS frontend — no build step, no frontend framework.
- Real driving-route distances via OSRM where available, falling back to straight-line distance.
- Runs locally today via a dev-server launch config; not yet deployed to a public URL for end users.
- Undecided: production hosting target.

## Brand Commitments

No CJ Mart corporate brand identity (colors, logo, typography) governs this internal tool. The visual theme is free to be chosen independently, per the user's explicit direction — she has pointed to a specific reference (an illustrated, peach/cream/orange-toned travel-app mockup) as the visual world she wants this system to adopt.

## Evidence on Hand

- Real production data already imported: ~224 staff, ~481 branches (200 active), 660 hotels, all with coordinates.
- No existing customer testimonials, case studies, or press — not applicable for an internal tool.

## Product Principles

- Encode real operational policy (distance thresholds, muster-point logic, duplicate prevention) as first-class validation, not afterthought copy.
- Keep both approval lines strictly separate in what each approver sees and can act on.
- Prefer real computed data (live distances, actual timestamps) over static or placeholder figures anywhere the product surfaces a number.
- Field users are on their phones between tasks — flows must stay usable one-handed, not just "responsive."
