# Aevigor

Website and installable app shell for Aevigor (lifelong vigour), served at aevigor.com.

- `index.html`: the website (home page).
- `app/`: the home-screen app. It shows the Google Apps Script web app full screen, with its own name and icon.
- `beta/`: the multi-user private beta (aevigor.com/beta): sign-in, consent, connect intervals.icu, Today, Check-in, Guide, Settings.
- `supabase/`: the beta's server: database tables and privacy rules (`migrations/`) and the `api` edge function (`functions/`).
- `docs/beta-setup.md`: one-time setup steps for the beta.
- `tests/`: `node tests/rules.test.mjs` and `node tests/sync.test.mjs`.

Hosted free with GitHub Pages. No personal data or API keys live in this repository. The beta's secrets live in GitHub Actions secrets and Supabase.
