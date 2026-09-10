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
  register.html         Beneficiary registration
  login.html            Sign in (routes to dashboard.html or admin/dashboard.html by role)
  dashboard.html         Beneficiary dashboard (shell — application/payment views next)
  apply.html              [next] Guided grant application + pre-screening
  application-status.html [next] Application progress tracker
  payments.html            [next] Payment history
  notifications.html       [next] Notifications list
  help.html                [next] Support requests and appeals
  admin/
    dashboard.html          [next] Administrator application queue
    application-review.html [next] Administrator review + decision screen
  css/
    styles.css            All styles (design tokens, layout, components)
  js/
    supabaseClient.js     Supabase connection config (fill in your keys here)
    auth.js               Register / login / logout / page protection
    nav.js                 Mobile menu + session-aware nav links
    dashboard.js            Beneficiary dashboard data loading
  db/
    schema.sql             Full database schema, RLS policies and seed data
  instructions.md          This file
```

Pages marked `[next]` are referenced by the navigation and buttons already
in place, but not yet built — they're the next phase of the project.

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
`grant_requirements`, `applications`, `documents`, `assessments`,
`payments`, `notifications`, `support_requests`, `audit_logs`), enables
Row Level Security on each one, and seeds the five grant types with a
starting set of eligibility rules.

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

## 7. File storage setup (for document uploads — needed by `apply.html`)

When the application wizard is built, supporting documents will be
uploaded to Supabase Storage. To prepare:
1. In Supabase, go to **Storage → New bucket**.
2. Name it `documents` and keep it **private** (not public).
3. Add a storage policy so a user can only upload/read files inside a
   folder named after their own user ID — this will be documented
   alongside `apply.html` when it's built.

## 8. Demonstration walkthrough (current phase)

1. Open `index.html` — homepage.
2. Click **Register**, create a fictional test account.
3. Sign in via `login.html` — you're redirected to `dashboard.html`.
4. The dashboard loads your name, an empty-state application card
   (until `apply.html` exists), and your notification count.
5. Promote that account to `admin` in the Supabase Table Editor and sign
   in again to confirm it redirects to `admin/dashboard.html` (once built).

## 9. Test accounts and sample data

No accounts are pre-seeded — create your own fictional test accounts
through `register.html`. Use fictional names, addresses and ID numbers
only; never enter real personal information into this prototype.

## 10. Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Blank page / module errors in console | Opened via `file://` instead of a local server | Serve the folder over `http://` (see Section 6) |
| "Supabase is not configured yet" message on forms | Keys not filled in | Edit `js/supabaseClient.js` (Section 3) |
| Registration succeeds but profile insert fails | Email confirmation is on, so `data.user` exists before `data.session` in some flows | Turn off "Confirm email" for local testing, or confirm the email first |
| Login succeeds but nothing loads on the dashboard | RLS policy mismatch or schema not run | Re-run `db/schema.sql`, confirm the `profiles` row exists for that user |
| Admin login goes to the wrong dashboard | `role` on the `profiles` row is not `admin` | Update it in Table Editor (Section 5) |

## 11. Known limitations (by design)

- No real banking, identity-verification, or medical-assessment
  integration — all are simulated.
- Only five grant types and a representative subset of their published
  eligibility rules are implemented.
- `apply.html`, `admin/`, `payments.html`, `notifications.html` and
  `help.html` are scaffolded in the navigation but not yet built — they
  are the next phase of this project.
