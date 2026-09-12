# SASSA Services Prototype — Setup Instructions

This is an academic prototype that evaluates the existing SASSA online
services and demonstrates a set of proposed improvements: guided grant
applications, automated eligibility pre-screening, application tracking,
an administrator review dashboard, and simulated payments.

**It is not an official SASSA product.** Payments, identity verification
and medical assessment are all simulated — nothing here connects to real
banking or government infrastructure.

## 1. Project structure

```
sassa-prototype/
  index.html            Homepage
  register.html         Beneficiary registration (captures date of birth)
  login.html            Sign in (routes to dashboard.html or admin/dashboard.html by role)
  dashboard.html         Beneficiary dashboard
  apply.html             Guided grant application wizard + pre-screening engine
  application-status.html Application progress tracker for one application
  payments.html            Payment history
  notifications.html       Notifications list, with mark-as-read
  help.html                Support requests and appeals, with a request history
  admin/
    dashboard.html          Administrator application queue (status counts, search, filter)
    dashboard.js             Admin queue data loading + search/filter
    application-review.html Review one application: applicant, documents, decision, payment
    application-review.js
    beneficiaries.html      Every registered beneficiary, with a jump into their applications
    beneficiaries.js
    support-requests.html   Enquiries, problem reports and appeals — respond and change status
    support-requests.js
  assets/
    hero-illustration.svg  Homepage illustration — replace with your own image any time (see Section 10)
  css/
    styles.css            All styles (design tokens, layout, components, wizard, timeline, admin, notifications)
  js/
    supabaseClient.js     Supabase connection config (fill in your keys here)
    auth.js               Register / login / logout / page protection (incl. requireAdminSession)
    nav.js                 Mobile menu + session-aware nav links + logout wiring
    dashboard.js            Beneficiary dashboard data loading
    screening.js             Pure pre-screening logic (no Supabase/DOM — reusable and easy to test)
    apply.js                 Application wizard: steps, screening calls, document upload, submit
    application-status.js    Loads and renders one application's progress
    payments.js               Payment history with a progress stepper per payment
    notifications.js           Notification list, mark one / mark all as read
    help.js                    Support request form + request history
  db/
    schema.sql             Full database schema, RLS policies, storage policies and seed data
  instructions.md          This file
```

Every page referenced in the navigation is now built.

## 1a. How the pre-screening engine works

`js/screening.js` is intentionally separate from the wizard UI (`js/apply.js`).
It takes the selected grant's rules (from `grant_requirements`) plus a small
`answers` object (age, and grant-specific answers like a child's age or
institutional residency) and returns one of three outcomes:

- **Potentially eligible** — every hard rule passed, no manual assessment needed.
- **Potentially ineligible** — a hard, unambiguous rule failed (e.g. age).
  The applicant is shown the specific reason and can pick a different grant.
- **Further assessment required** — hard rules passed, but the grant has a
  rule marked `requires_manual_assessment` (means test, disability
  assessment, caregiver relationship, foster status, care dependency). The
  application still proceeds — it is never auto-rejected for these.

Because the rules live in `grant_requirements` rather than in the code, you
can add or change a rule (e.g. adjust the age threshold) directly in the
database without touching `screening.js` or `apply.js`.

## 2. Prerequisites

- A modern web browser (Chrome, Firefox, Edge).
- A code editor (e.g. VS Code).
- A free Supabase account: https://supabase.com
- A simple local web server. Because the pages use JavaScript modules
  (`<script type="module">`), they must be served over `http://`, not
  opened directly as a `file://` path. Any of these work:
  - VS Code's "Live Server" extension
  - `npx serve .` (requires Node.js)
  - Python: `python3 -m http.server 5500`

## 3. Supabase project setup

1. Go to https://supabase.com and create a new project.
   - Choose a project name (e.g. `sassa-prototype`).
   - Choose a region close to you.
   - Set a strong database password and store it somewhere safe.
2. Wait for the project to finish provisioning (a couple of minutes).
3. In the left sidebar, go to **Settings → API**.
4. Copy two values:
   - **Project URL** — looks like `https://xxxxxxxx.supabase.co`
   - **anon public** key — a long string under "Project API keys"
5. Open `js/supabaseClient.js` in this project and replace:
   ```js
   const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```
   with the values you copied.

**Never** use the `service_role` key in this file or anywhere in the
frontend code — it bypasses Row Level Security and must stay private.
Never commit real Supabase keys to a public repository; if you push this
project to GitHub, treat `js/supabaseClient.js` as sensitive or move the
keys into an untracked config file.

## 4. Database schema setup

1. In your Supabase project, open **SQL Editor → New query**.
2. Open `db/schema.sql` from this project, copy its full contents, and
   paste it into the SQL editor.
3. Click **Run**.

This creates every table described in the SRS (`profiles`, `grant_types`,
`grant_requirements`, `grant_documents`, `applications`, `documents`,
`assessments`, `payments`, `notifications`, `support_requests`,
`audit_logs`), enables Row Level Security on each one, and seeds the five
grant types with a starting set of eligibility rules and their required
document checklist.

`profiles.date_of_birth` and `applications.details` (a flexible JSON field
for grant-specific answers like a child's name or a foster-care reference
number) are part of the same schema file — if you already ran an earlier
version of `schema.sql` before these were added, run:
```sql
alter table profiles add column if not exists date_of_birth date;
alter table applications add column if not exists details jsonb not null default '{}'::jsonb;
```

If you ran `schema.sql` before the admin dashboard was built, one more
change matters: `applications.user_id`, `payments.beneficiary_id`,
`notifications.user_id`, `support_requests.user_id` and
`audit_logs.user_id` now point at `profiles(id)` instead of
`auth.users(id)`. This is what lets the admin queue join straight to a
beneficiary's name. Since `profiles.id` and `auth.users.id` are always
the same value, this is safe to apply on an existing project — but
Postgres won't let you swap a foreign key target with data already in
place via a one-line `alter`, so on an existing project it's simplest to
either re-run the whole `schema.sql` on a fresh project, or ask in your
Supabase SQL editor for the specific `alter table ... drop constraint ...
add constraint ... references profiles(id)` statements for each column
above.

**What the RLS policies do, in plain terms:**
- A beneficiary can only read or change rows that belong to them
  (matched on `user_id` / `beneficiary_id` / `id`).
- An admin (a profile with `role = 'admin'`) can read and update
  applications, documents, assessments, payments and support requests
  across *all* beneficiaries.
- `grant_types` and `grant_requirements` are readable by any signed-in
  user (so the application form can show requirements) but only
  writable through the SQL editor for now.
- `audit_logs` is admin-only in both directions.

## 5. Authentication and the login process

This project uses **Supabase Auth** with the email/password provider,
which is enabled by default on a new Supabase project.

**Registering a beneficiary account:**
1. Open `register.html` in your browser (via your local server).
2. Fill in the form and submit.
3. `js/auth.js` calls `supabase.auth.signUp()`, then inserts a matching
   row into `profiles` (with `role = 'beneficiary'`) using the new
   user's ID.
4. If your Supabase project has "Confirm email" turned on (Authentication
   → Providers → Email), the user must click the confirmation link
   before they can sign in. For faster testing during development, you
   can turn this off in that same settings screen.

**Creating an administrator account:**
There is no public "admin sign-up" screen — this is intentional. To
create an admin account for testing:
1. Register a normal account through `register.html`.
2. In Supabase, go to **Table Editor → profiles**, find that user's row,
   and change `role` from `beneficiary` to `admin`.
3. That account will now be routed to `admin/dashboard.html` on login.

**What happens on login:**
`js/auth.js` calls `supabase.auth.signInWithPassword()`, then looks up
the user's `role` in `profiles` and redirects: `admin` →
`admin/dashboard.html`, everyone else → `dashboard.html`.

**Session handling:** `js/auth.js` exposes `requireSession()`, which any
protected page calls on load; a visitor with no active session is sent
to `login.html`. `js/nav.js` checks the session on every page to decide
whether the nav shows "Log in / Register" or "Dashboard / Log out".

**Logging out:** the "Log out" link in the nav calls
`supabase.auth.signOut()` and returns to `index.html`.

## 6. Running the project locally

From the project's root folder:

```bash
python3 -m http.server 5500
```

Then open `http://localhost:5500/index.html` in your browser. (If you're
using VS Code Live Server instead, right-click `index.html` → "Open with
Live Server".)

## 7. File storage setup (required — `apply.html` uploads documents here)

The application wizard uploads supporting documents to Supabase Storage,
so this step is required, not optional, from this phase onward:

1. In Supabase, go to **Storage → New bucket**.
2. Name it exactly `documents` and keep it **private** (not public).
3. `db/schema.sql` already creates the matching storage policies (a user
   can only read/write inside a folder named after their own user ID;
   admins can read every folder) — you don't need to add these by hand,
   just make sure `schema.sql` has been run *after* the bucket exists.

Uploaded files are stored under `{user_id}/{reference_number}/{document_type}__{filename}`.

## 8. Demonstration walkthrough

1. Open `index.html` — homepage.
2. Click **Register**, create a fictional test account (include a date of birth).
3. Sign in via `login.html` — you're redirected to `dashboard.html`.
4. Click **Apply for a Grant** and go through the wizard:
   - Confirm your personal details.
   - Select a grant (try **Older Person's Grant** with an under-60 date of
     birth to see a *potentially ineligible* result, then try
     **Disability Grant** to see a *further assessment required* result).
   - Fill in the additional information for your chosen grant.
   - Upload a document for each required item (any file works for testing).
   - Review and submit — you'll get a reference number and a progress tracker.
5. From the dashboard, click **View details** on your application to see
   `application-status.html` render the same application's progress.
6. Promote that account to `admin` in the Supabase Table Editor and sign
   in again to confirm it redirects to `admin/dashboard.html`.
7. In the admin dashboard, find your test application and click
   **Review**. Opening it moves the status to "Under review" automatically.
8. Try each action: **Request additional documents** (the beneficiary
   gets a notification), **Approve** (enter a grant amount — this
   schedules a simulated payment), or **Reject** (with a reason the
   beneficiary will see on `application-status.html`).
9. If approved, use **Mark as Processing** / **Mark as Completed** on the
   payment card to walk the simulated payment through its stages, then
   check `application-status.html` as the beneficiary to see it reflected.
10. Sign back in as the beneficiary and check **Payments** (the same
    payment with its own progress stepper) and **Notifications** (you
    should see an entry for every step above — submission, approval,
    each payment update — with unread ones highlighted).
11. From **Help**, submit an appeal or enquiry linked to your application
    and confirm it appears in "My requests" with a reference number.

## 9. Test accounts and sample data

No accounts are pre-seeded — create your own test accounts through
`register.html`. Use realistic but non-sensitive details (a real ID
number belonging to you is fine for your own test account; just don't
use anyone else's real personal information).

## 10. Replacing the homepage image

`index.html` currently shows an original illustration
(`assets/hero-illustration.svg`) rather than a photo, so there's nothing
here to license or attribute. To use your own photo instead:

1. Add your image file to the `assets/` folder (e.g. `assets/hero-photo.jpg`).
2. In `index.html`, find the `<img>` tag inside `<div class="hero-media">`
   and change its `src` to your new file:
   ```html
   <img src="assets/hero-photo.jpg" alt="Describe the photo here" />
   ```
3. A roughly square or portrait photo around 800×800px works best with
   the current layout; anything larger will just be scaled down by the
   CSS (`.hero-media img`).

## 11. Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Blank page / module errors in console | Opened via `file://` instead of a local server | Serve the folder over `http://` (see Section 6) |
| "Supabase is not configured yet" message on forms | Keys not filled in | Edit `js/supabaseClient.js` (Section 3) |
| Registration succeeds but profile insert fails | Email confirmation is on, so `data.user` exists before `data.session` in some flows | Turn off "Confirm email" for local testing, or confirm the email first |
| Login succeeds but nothing loads on the dashboard | RLS policy mismatch or schema not run | Re-run `db/schema.sql`, confirm the `profiles` row exists for that user |
| Admin login goes to the wrong dashboard | `role` on the `profiles` row is not `admin` | Update it in Table Editor (Section 5) |
| Document upload fails during Submit | `documents` storage bucket doesn't exist yet, or `schema.sql` was run before the bucket was created | Create the bucket first (Section 7), then re-run just the storage policy statements at the bottom of `schema.sql` |
| Screening always says "further assessment required" | Expected for Foster Child and Care Dependency grants — they have no hard rules by design, only manual-assessment ones | Not a bug — see Section 1a |

## 12. Known limitations (by design)

- No real banking, identity-verification, or medical-assessment
  integration — all are simulated.
- Only five grant types and a representative subset of their published
  eligibility rules are implemented.
- The screening engine matches grant-specific field configs in `apply.js`
  by exact grant name (e.g. `"Older Person's Grant"`). If you rename a
  grant in the database, update the matching keys in
  `QUICK_CHECK_FIELDS_BY_GRANT` and `ADDITIONAL_FIELDS_BY_GRANT`.
