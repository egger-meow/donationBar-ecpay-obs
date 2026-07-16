# Google OAuth 2.0 Setup Guide

Google OAuth is the **only** sign-in method in this codebase. There is no local
username/password signup, login, or password-reset flow — no `signup.html` or
equivalent exists in [public/](../../public/). This is true in sandbox mode too:
`ENVIRONMENT=sandbox` only changes the storage backend (JSON file vs. PostgreSQL), not
how you sign in. You need a working Google OAuth client for local development, staging,
and production alike.

## What's already implemented (nothing to build)

- Passport.js `GoogleStrategy`, registered only if `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are set ([server.js](../../server.js)).
- Routes: `GET /api/auth/google` (starts the flow) and
  `GET /api/auth/google/callback` (handles Google's redirect back).
- On first login with a given email: creates the user (`authProvider: 'google'`,
  `emailVerified: true`, no password hash), a workspace, and a subscription. A
  device-fingerprint check decides whether the new account gets a 30-day trial or
  falls straight to the free plan, to prevent repeat trial abuse from the same device.
- On a returning email: logs the existing user in and updates last-login time.
- Failure (user denies access, invalid state, etc.) redirects to `/login?error=oauth_failed`,
  which `login.html` reads to show an inline error.
- Success redirects to `/admin`.

None of this needs code changes to get working — it needs a real OAuth client
registered in Google Cloud Console and the resulting credentials in your environment.

## Step 1: Create a Google OAuth 2.0 client

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create or select a project (any name, e.g. "DonationBar").
3. Configure the **OAuth consent screen** first if you haven't already:
   - User type: External.
   - App name, support email, developer contact email.
   - Scopes: the default `email` and `profile` are sufficient — this app doesn't
     request anything beyond that.
   - While the app is in testing mode, add every Google account you'll sign in with
     as a test user (yourself, and later your bootstrap `ADMIN_EMAIL` account if
     different).
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID** → **Web
   application**.
5. Set **Authorized JavaScript origins** and **Authorized redirect URIs**:

   | Environment | Origin | Redirect URI |
   |---|---|---|
   | Local | `http://localhost:3000` | `http://localhost:3000/api/auth/google/callback` |
   | Production | `https://your-domain.example` | `https://your-domain.example/api/auth/google/callback` |

   The redirect URI must match `GOOGLE_CALLBACK_URL` **exactly**, including scheme.
6. Copy the generated Client ID and Client Secret.

## Step 2: Set environment variables

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

For production, use the HTTPS values from the table above and also set `BASE_URL` to
the same domain — see [COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md) for the full
env var reference.

## Step 3: Bootstrap admin (local/first deploy only)

`npm run migrate` creates the initial `'default'`-slug workspace and its owner user from
`ADMIN_EMAIL` in your `.env`. Set `ADMIN_EMAIL` to the **exact Google account email**
you intend to sign in with — the match happens by email at OAuth login time, not by any
password (`ADMIN_PASSWORD` is stored but never used to sign in).

## Step 4: Test the flow

1. `npm start` (or `npm run dev`).
2. Visit `http://localhost:3000/login`, click "使用 Google 帳號登入".
3. Sign in with the Google account matching `ADMIN_EMAIL` (or any account, for a
   non-bootstrap workspace).
4. You should land on `/admin`.

## Troubleshooting

- **"Google OAuth not configured" / Google button does nothing** — `GOOGLE_CLIENT_ID`
  or `GOOGLE_CLIENT_SECRET` is missing; the strategy is only registered when both are
  set.
- **Redirect URI mismatch** — the URI Google rejects must be added to "Authorized
  redirect URIs" in Google Cloud Console *exactly*, including trailing slashes or their
  absence.
- **Redirected to `/login?error=oauth_failed`** — user denied consent, the `state`
  parameter failed validation, or credentials are wrong. Check server logs (session
  fields are intentionally never logged, but the failure itself is).
- **"This app hasn't been verified"** — expected while the OAuth consent screen is in
  testing mode. For development, click through "Advanced → Go to (app name) (unsafe)".
  Add every tester account under "Test users" in the consent screen config. Submitting
  for Google verification is only needed before a public, non-test-user launch.
- **Signed in but on the wrong workspace / not admin** — `ADMIN_EMAIL` in `.env` must
  match the Google account email exactly, and the match only happens against the state
  set by `npm run migrate`, not retroactively.

## Production checklist

- [ ] Google Cloud Console has the production domain in both Authorized JavaScript
      origins and Authorized redirect URIs.
- [ ] `GOOGLE_CALLBACK_URL` and `BASE_URL` both use the real HTTPS domain.
- [ ] OAuth consent screen is out of testing mode (or every real user is added as a
      test user), if you need sign-ins beyond your own test accounts.
- [ ] Full OAuth flow exercised once against the real deployed domain, not just
      `localhost`.
