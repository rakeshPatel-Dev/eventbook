# EventBook — Security Analysis & Bug Report

> **Scope:** Full codebase review of `apps/api` (Express REST API), `apps/web` (Next.js frontend), `database/` (schema + seed), and configuration files.  
> **Date:** 2026-10-16  
> **Verdict:** The overall security posture is **good for a project at this stage**. The most critical business rules (auth, RBAC, overbooking prevention, CSRF guard) are enforced correctly. The issues below range from a **critical credential leak** down to nice-to-have hardening.

---

## Table of Contents

1. [Critical Issues](#1-critical-issues)
2. [High Severity](#2-high-severity)
3. [Medium Severity](#3-medium-severity)
4. [Low Severity / Bugs](#4-low-severity--bugs)
5. [Informational / Best Practices](#5-informational--best-practices)
6. [What Is Done Well](#6-what-is-done-well)
7. [Remediation Priority Checklist](#7-remediation-priority-checklist)

---

## 1. Critical Issues

### 🔴 CRIT-01 — Real Supabase credentials committed to `apps/api/.env`

**File:** [`apps/api/.env`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/.env)

**Problem:** The `.env` file contains a fully-formed production-grade Supabase connection string with a hardcoded password (redacted here):

```
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=no-verify
```

While `.env` is correctly in `.gitignore` and doesn't appear in git history, the connection string:

1. Contains a **real password** to a hosted Supabase instance.
2. Uses **`sslmode=no-verify`**, disabling TLS certificate validation — this means a man-in-the-middle could intercept all DB traffic and the client would never know.

If this file were ever accidentally pushed (e.g. via `git add .`), the password would be exposed publicly. The password is also the **only** access control; no IP allowlisting, IAM, or per-service DB roles are visible.

**Fixes:**

- Immediately rotate the Supabase database password.
- Change `sslmode=no-verify` to `sslmode=require` (or `verify-full` for maximum security).
- Consider adding Supabase's trusted IP restrictions in the dashboard.
- For production, use separate DB credentials with minimum necessary privileges (not the `postgres` superuser).

---

## 2. High Severity

### 🟠 HIGH-01 — No HTTP security headers on the API

**File:** [`apps/api/src/app.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/app.ts)

**Problem:** The Express app has no security-header middleware (e.g. `helmet`). This means responses lack:

| Missing Header                    | Risk                            |
| --------------------------------- | ------------------------------- |
| `X-Content-Type-Options: nosniff` | MIME-sniffing attacks           |
| `X-Frame-Options: DENY`           | Clickjacking                    |
| `Strict-Transport-Security`       | HTTP downgrade (prod)           |
| `X-XSS-Protection`                | Legacy XSS (older browsers)     |
| `Referrer-Policy`                 | Info leakage via Referer        |
| `Permissions-Policy`              | Unwanted browser feature access |

**Fix:** Add `helmet` before other middleware:

```ts
import helmet from 'helmet';
app.use(helmet());
```

---

### 🟠 HIGH-02 — No rate limiting on auth endpoints

**File:** [`apps/api/src/auth/routes.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/auth/routes.ts)

**Problem:** `POST /api/auth/login` and `POST /api/auth/register` have no rate limiting. An attacker can perform:

- **Credential stuffing** against login — unlimited attempts.
- **Email enumeration brute-force** — although the code returns generic "Invalid email or password" messages and has timing-attack protection (`burnLoginTiming`), a sufficiently fast brute force can still infer registered emails from timing differences at scale.
- **Account creation spam** against register.

The project brief lists rate limiting on login as a bonus item, but given this is exposed on the internet (deployed to Render/Railway per the brief), this is a meaningful gap.

**Fix:**

```ts
import rateLimit from 'express-rate-limit';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
router.post('/login', authLimiter, requireOrigin, ...);
router.post('/register', authLimiter, requireOrigin, ...);
```

---

### 🟠 HIGH-03 — No request body size limit configured

**File:** [`apps/api/src/app.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/app.ts#L27-L27)

**Problem:** `express.json()` is called with no `limit` option, defaulting to **100 kb**. While that's small enough not to be catastrophic, combined with no rate limiting this could be used to spike memory or CPU (e.g., sending 100 kb JSON payloads at high frequency against the login endpoint).

**Fix:**

```ts
app.use(express.json({ limit: '16kb' }));
```

---

### 🟠 HIGH-04 — Admin event list loads all events with `limit=50` — no server-side pagination guard

**File:** [`apps/web/app/admin/page.tsx`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/app/admin/page.tsx#L124-L124)

**Problem:** The admin frontend calls `/api/events?scope=all&limit=50`. The API's `MAX_LIST_LIMIT` is 50 ([`events/validation.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/events/validation.ts#L4-L4)), so no more than 50 events ever appear in the admin panel at once. If the DB grows beyond 50 events, **older events silently disappear** from the admin view without any pagination UI shown.

This is both a functional bug (data loss from admin's perspective) and a potential security concern (admin cannot see/audit all events).

**Fix:** Add proper pagination to the admin event list, or increase the limit and add cursor/offset pagination controls in the admin UI.

---

## 3. Medium Severity

### 🟡 MED-01 — CSRF protection is partial and could be bypassed in some deployment topologies

**File:** [`apps/api/src/auth/middleware.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/auth/middleware.ts#L66-L79)

**Problem:** `requireSameOrigin` checks `req.headers.origin`:

```ts
const origin = req.headers.origin;
if (origin && origin !== frontendOrigin) {
  res.status(403).json({ error: 'Forbidden' });
  return;
}
next(); // ← passes if origin is ABSENT
```

When `origin` is `undefined` (e.g. server-side/curl requests), the check passes. The comment says "Non-browser clients (curl, tests) send no Origin header and are unaffected." — this is **intentional** but means any request without an Origin header (e.g. from a same-site but different-origin server, a mobile app, or via a CSS-based CSRF with `same-origin` fetch mode) will bypass the check.

This is acceptable for the stated threat model (browser CSRF), but in production with `SameSite=None`, the protection degrades. The note in `architecture.md` recommends `SameSite=None` for cross-site production deployments — at that point, CSRF protection shifts entirely to this origin check, which still passes for non-browser clients.

**Fix:** For sensitive endpoints, additionally validate that a known custom header (e.g. `X-Requested-With: XMLHttpRequest`) is present — modern CORS/browser security prevents cross-origin scripts from adding custom headers.

---

### 🟡 MED-02 — Cancellation endpoint has TOCTOU race

**File:** [`apps/api/src/bookings/routes.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/bookings/routes.ts#L141-L181)

**Problem:** The cancel flow reads the booking first, checks ownership and event date, then issues a separate `UPDATE`. There is no database-level lock (`SELECT ... FOR UPDATE`) between read and write:

```ts
// Read (no lock):
const found = await pool.query(`SELECT b.id, b.user_id, b.status, e.starts_at ...`);
// ...checks...
// Write (separate query):
const updated = await pool.query(`UPDATE bookings SET status = 'cancelled'...`);
```

Two simultaneous cancellation requests for the same booking could both read `status = 'confirmed'`, both pass the status check, and both attempt the update. The second update is a no-op (idempotent since `status` is already `'cancelled'`), so there's no functional corruption — but the second request gets a 200 instead of a 409 ("already cancelled").

This is a correctness bug, not a security hole, but it can result in misleading API responses.

**Fix:** Wrap the cancel in a transaction with `SELECT ... FOR UPDATE` (same pattern already used in `POST /api/bookings`).

---

### 🟡 MED-03 — No max session count per user

**File:** [`apps/api/src/auth/sessions.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/auth/sessions.ts)

**Problem:** Each login creates a new session row. A user can accumulate unlimited sessions (e.g. if they login from 100 devices or via a script). While `deleteExpiredSessions` is called lazily on login, there's no cap on active sessions per user. An attacker with access to the login endpoint could create thousands of session rows, bloating the `sessions` table.

**Fix:** Optionally cap active sessions per user (e.g., 10) and delete the oldest on overflow, or enforce cleanup on every login.

---

### 🟡 MED-04 — `seats_left` can go negative in edge cases

**File:** [`apps/api/src/events/routes.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/events/routes.ts#L45-L47), [`apps/web/app/components/SeatsBadge.tsx`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/app/components/SeatsBadge.tsx#L146-L148)

**Problem:** `seats_left` is computed in SQL as `total_seats - COUNT(confirmed_bookings)`. If an admin reduces `total_seats` below confirmed bookings (which the API correctly blocks), this stays safe. But the frontend does:

```ts
const taken = Math.max(0, event.totalSeats - event.seatsLeft);
```

…which implies `seatsLeft` could be negative (the `Math.max(0, ...)` guard is a tell). The API casts `seats_left` to `::int` but doesn't clamp it. If data were manipulated at the DB level (e.g. a compromised admin account manually decreases `total_seats`), the API would return a negative `seatsLeft` that the frontend silently clamps.

This is a defense-in-depth gap: the API should return `Math.max(0, seatsLeft)` itself.

---

### 🟡 MED-05 — `window.confirm()` used for delete confirmation in admin

**File:** [`apps/web/app/admin/page.tsx`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/app/admin/page.tsx#L238-L239)

```ts
if (!window.confirm(`Delete "${title}"? Events with bookings cannot be deleted.`)) {
  return;
}
```

**Problem:** `window.confirm` is synchronous and blocking. In some browser environments (iframes, specific CSP policies, or testing tools), it may be silently suppressed or auto-dismissed as `false`/`true`. It also renders unstyled and doesn't match the app's UI language.

**Bug:** If the `title` contains double-quote characters (e.g., a title like `"Node.js" Workshop`), the confirm dialog renders ambiguous text. This is not exploitable for XSS (it's inside the native OS dialog), but it is confusing UX.

**Fix:** Replace with the existing custom confirmation UI already used in the bookings page (the two-button "Keep / Confirm cancel" pattern).

---

## 4. Low Severity / Bugs

### 🔵 BUG-01 — Seed credentials logged in plaintext to console

**File:** [`database/seed.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/database/seed.ts#L536-L537)

```ts
console.log(`Admin: ${ADMIN_EMAIL} / ${LOCAL_ADMIN_PASSWORD} (local development only)`);
console.log(`User:  ${USER_EMAIL} / ${USER_PASSWORD} (local development only)`);
```

**Problem:** The demo passwords `Admin123!` and `User1234!` are logged to stdout. In a CI/CD pipeline with log retention, these plaintext credentials persist in logs. The comment says "local development only" but the seed script is also used in CI.

The production path correctly states "The password was not logged." — but the dev path is inconsistent with this philosophy.

**Fix:** Log only the email addresses, not the passwords:

```ts
console.log(`Admin: ${ADMIN_EMAIL} (see seed constants for dev password)`);
```

---

### 🔵 BUG-02 — `POST /api/events/:id/create` order: `requireOrigin` after auth/admin middleware allows timing oracle

**File:** [`apps/api/src/events/routes.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/events/routes.ts#L195-L195)

```ts
router.post('/', requireAuth(pool), requireAdmin(), requireOrigin, ...);
```

**Problem:** `requireOrigin` runs **after** `requireAuth` and `requireAdmin`. This means the server does a DB lookup (session validation) before checking the Origin header. A cross-origin attacker sending requests to the admin endpoint would get a DB query on every attempt before being rejected — a minor resource waste. The correct order is `requireOrigin` first (cheap header check), then DB calls.

**Fix:**

```ts
router.post('/', requireOrigin, requireAuth(pool), requireAdmin(), ...);
```

Apply consistently to all mutation endpoints.

---

### 🔵 BUG-03 — `MyBookings` context re-fetches `/api/bookings/mine` on every route change, including unauthenticated pages

**File:** [`apps/web/app/components/MyBookings.tsx`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/app/components/MyBookings.tsx#L63-L65)

```ts
useEffect(() => {
  void refresh();
}, [refresh, pathname]);
```

**Problem:** Every page navigation triggers a fresh fetch to `/api/bookings/mine`. For unauthenticated users, this results in a guaranteed 401 on every route change — a wasted round-trip. For authenticated users, it fetches even on pages that don't show booking highlights (e.g., `/login`, `/register`, `/admin`).

**Fix:** Skip the fetch if no session cookie is known to be present (check the response of `/api/auth/me` first), or only trigger on bookings-relevant pages.

---

### 🔵 BUG-04 — `attendeeError` in admin page is shared across all event panels

**File:** [`apps/web/app/admin/page.tsx`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/app/admin/page.tsx#L111-L111)

```ts
const [attendeeError, setAttendeeError] = useState<string | null>(null);
```

**Problem:** There is a single `attendeeError` state for all events. If loading attendees for event A fails, then the user opens event B (which loads successfully), the error for A is cleared. Conversely, if A succeeded and B fails, B's error appears in A's panel if A is still open. The state is per-page, not per-event.

**Fix:** Use a record like `attendeeError`, keyed by event ID — matching the pattern already used for `attendees` and `openAttendees`.

---

### 🔵 BUG-05 — No redirect after login when arriving from a protected route

**File:** [`apps/web/app/login/page.tsx`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/app/login/page.tsx#L40-L41)

```ts
router.push('/events');
router.refresh();
```

**Problem:** After a successful login, the user is always redirected to `/events`, regardless of which page they came from. If a user clicks "Sign in" on an event detail page to book a seat, after login they land on `/events` rather than the original event — creating friction and lost context.

**Fix:** Pass a `?redirect=/events/UUID` query parameter from the event page to the login page, and redirect there after successful authentication.

---

### 🔵 BUG-06 — `toastError` referenced in `useEffect` dependency array (stale closure risk)

**File:** [`apps/web/app/events/EventSection.tsx`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/app/events/EventSection.tsx#L119-L119)

```ts
}, [search, page, pastOnly, retryKey, toastError]);
```

**Problem:** `toastError` from `useToast()` is included in the `useEffect` dependency array. Since `useToast()` returns a new object reference on every render (even though the `toast` callback is memoized in `ToastProvider`), and React's `useMemo` for the value in `Toast.tsx` depends on `[toast]` which itself is stable — this is technically safe. But it's fragile: if `ToastProvider` ever changes its memoization, `toastError` will change identity on every render and trigger infinite re-fetches.

**Fix:** Destructure `toastError` outside the effect and wrap it in `useCallback`, or use the `toast` function directly with `'error'` kind.

---

### 🔵 BUG-07 — Login page does not validate email format before submission

**File:** [`apps/web/app/login/page.tsx`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/app/login/page.tsx#L103-L106)

```ts
{...register('email', {
  required: 'Email is required.',
  pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Enter a valid email.' },
})}
```

**Problem:** This validation exists. ✓ However, if JavaScript is disabled or `noValidate` is removed accidentally, `type="email"` on the input would catch it. `noValidate` is correctly set on the `<form>` to let `react-hook-form` handle it — this is fine. Minor note: the register page has identical validation, which is good for consistency.

> This was investigated and is **not a bug** — noted for completeness.

---

### 🔵 BUG-08 — Uncommitted frontend changes not in git history

**Git status output:**

```
modified:   apps/web/app/admin/page.tsx
modified:   apps/web/app/bookings/page.tsx
... (14 total modified/untracked files)
```

**Problem:** A large body of frontend work (the UI redesign including Toast, Footer, Feedback, MyBookings, SeatsBadge components and major page reworks) has not been committed. The `database/seed.ts` — which includes all 18-event seed data and production guard logic — is also uncommitted.

If the working tree were accidentally reset or the machine were lost, this work would be gone. For a submission-deadline project, this is a meaningful risk.

**Fix:** Commit all pending work with meaningful messages before the submission deadline.

---

## 5. Informational / Best Practices

### ℹ️ INFO-01 — No Content Security Policy on the frontend

**File:** [`apps/web/next.config.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/next.config.ts)

No `headers()` function is defined in `next.config.ts`. Next.js can set CSP and other security headers globally. While the app avoids `dangerouslySetInnerHTML` and renders no untrusted HTML (✓ confirmed by grep), a CSP is defense-in-depth and should be added before production hardening.

```ts
// next.config.ts
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ],
  }];
}
```

---

### ℹ️ INFO-02 — Sessions table has no expiry-based automatic cleanup

**File:** [`database/schema.sql`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/database/schema.sql#L65-L74)

Expired sessions are cleaned lazily on login via `deleteExpiredSessions`. The `sessions_expires_at_idx` index helps. But in practice, sessions that expire without the user logging in again accumulate indefinitely. For a long-running app, this table can grow unboundedly.

**Fix:** Add a scheduled cleanup (pg_cron, a periodic Node.js job, or a Supabase scheduled function) to purge rows where `expires_at < now()`.

---

### ℹ️ INFO-03 — No `README.md` with test accounts and live URL (required by brief)

**File:** [`README.md`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/README.md) (root-level, currently a placeholder)

The project brief requires a README with live links, test credentials, tech stack, data model, API sketch, and known issues. The current README file exists but its content was not reviewed here. If it is incomplete, that is the most direct evaluation criteria item to address before the deadline.

---

### ℹ️ INFO-04 — `password` field type in forms does not prevent browser autocomplete of plaintext

**File:** [`apps/web/app/login/page.tsx`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/app/login/page.tsx#L120-L120), [`apps/web/app/register/page.tsx`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/web/app/register/page.tsx#L120-L120)

`autoComplete="current-password"` and `autoComplete="new-password"` are correctly set. ✓ The password toggle (Eye/EyeOff) switches `type` between `"password"` and `"text"` — this is a known pattern and is acceptable as the user explicitly opts in.

> This is **not a bug** — noted for completeness.

---

### ℹ️ INFO-05 — `cors` allows any `FRONTEND_ORIGIN` without validation

**File:** [`apps/api/src/app.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/app.ts#L21-L26)

If `FRONTEND_ORIGIN` is misconfigured (e.g., set to `*`), CORS would allow any origin with credentials — a dangerous misconfiguration. The `requireSameOrigin` middleware would still reject credential-bearing state-mutating requests, but GET requests (e.g., `/api/events`) would be accessible from any origin.

**Fix:** Validate that `FRONTEND_ORIGIN` is a well-formed URL in `loadConfig()`:

```ts
new URL(requireEnv('FRONTEND_ORIGIN')); // throws on invalid URL
```

---

### ℹ️ INFO-06 — Test helper registers admins via SQL role promotion, not via a dedicated admin creation path

**File:** [`apps/api/src/test/helper.ts`](file:///mnt/NewVolume/Internship/LeafClutch/eventbook/apps/api/src/test/helper.ts#L94-L103)

```ts
export async function registerAdmin(pool, baseUrl, email) {
  const cookie = await registerUser(baseUrl, email, password);
  await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [email]);
  return cookie;
}
```

This is the correct and secure pattern — it verifies that there's no API path to promote oneself to admin. ✓ Just worth noting explicitly that this is intentional and correct per the brief's requirement.

---

## 6. What Is Done Well

The codebase demonstrates solid security thinking across the board:

| Area                             | Implementation                                                               |
| -------------------------------- | ---------------------------------------------------------------------------- |
| **Password hashing**             | bcrypt cost 10, consistent across routes and seed                            |
| **Timing attack prevention**     | `burnLoginTiming()` on missing user (dummy hash compare)                     |
| **Session tokens**               | 256-bit `randomBytes`, only SHA-256 hash in DB — never plaintext             |
| **HttpOnly cookies**             | `Secure` in prod, `SameSite` configurable, 7-day TTL                         |
| **SQL injection prevention**     | 100% parameterized queries, no string concatenation                          |
| **RBAC**                         | `requireAuth` + `requireAdmin` chained; roles from DB, never from client     |
| **Role self-escalation blocked** | `role` field in register body is silently ignored (hardcoded `'user'`)       |
| **Overbooking prevention**       | `SELECT ... FOR UPDATE` transaction with concurrent-booking test             |
| **Email normalization**          | Lowercased and trimmed before storage + DB CHECK constraint                  |
| **No secret exposure**           | No Supabase service-role key in frontend; only `NEXT_PUBLIC_API_URL`         |
| **CORS with credentials**        | Restricted to `frontendOrigin` only, never `'*'`                             |
| **CSRF guard**                   | Origin-header check on all state-mutating endpoints                          |
| **Input validation**             | Server-side length caps (email 254, password 72, title 200, etc.)            |
| **Error format**                 | Never leaks stack traces; generic 500 response                               |
| **Session revocation**           | Logout deletes server-side row; expired sessions rejected by SQL             |
| **Idempotent seed**              | Upserts, conflict handling, and production guard (`NODE_ENV=production`)     |
| **TypeScript strict mode**       | Full strict TypeScript; `tsc --noEmit` passes cleanly                        |
| **No XSS vectors**               | No `dangerouslySetInnerHTML`; all user content rendered via React text nodes |
| **Dependency audit**             | `npm audit` returns 0 vulnerabilities                                        |

---

## 7. Remediation Priority Checklist

| Priority                      | Issue                                                        | Effort |
| ----------------------------- | ------------------------------------------------------------ | ------ |
| 🔴 **Immediate**              | [CRIT-01] Rotate Supabase password, fix `sslmode=no-verify`  | 5 min  |
| 🟠 **Before live submission** | [HIGH-01] Add `helmet` middleware                            | 10 min |
| 🟠 **Before live submission** | [HIGH-02] Add rate limiting on auth endpoints                | 15 min |
| 🟠 **Before live submission** | [HIGH-04] Fix admin event list pagination (currently cap 50) | 30 min |
| 🟠 **Before live submission** | [BUG-08] Commit all uncommitted frontend + seed work         | 5 min  |
| 🟡 **Nice to have**           | [MED-02] Wrap cancel in transaction with `FOR UPDATE`        | 20 min |
| 🟡 **Nice to have**           | [MED-04] Clamp `seatsLeft` to `>=0` in API response          | 5 min  |
| 🟡 **Nice to have**           | [MED-05] Replace `window.confirm` with custom modal          | 20 min |
| 🔵 **Polish**                 | [BUG-04] Per-event `attendeeError` state in admin            | 10 min |
| 🔵 **Polish**                 | [BUG-05] Post-login redirect to originating page             | 20 min |
| 🔵 **Polish**                 | [BUG-03] Skip `/api/bookings/mine` on unauthenticated pages  | 10 min |
| ℹ️ **Hardening**              | [INFO-01] Add CSP headers via `next.config.ts`               | 15 min |
| ℹ️ **Hardening**              | [INFO-02] Schedule `sessions` table expiry cleanup           | 15 min |
| ℹ️ **Hardening**              | [INFO-05] Validate `FRONTEND_ORIGIN` is a valid URL          | 5 min  |
| ℹ️ **Hardening**              | [HIGH-03] Set `express.json({ limit: '16kb' })`              | 2 min  |
| ℹ️ **Hardening**              | [BUG-02] Move `requireOrigin` before DB middleware           | 5 min  |
| ℹ️ **Hardening**              | [BUG-01] Remove plaintext passwords from seed log output     | 2 min  |

---

_Generated by code review of commit `bb441c3` + working tree (2026-10-16)._
