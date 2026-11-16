# Aevigor beta: one-time setup

About 1 to 1.5 hours, done once. Use the **Aevigor Gmail** for every new account below, so the business owns them.
Nothing here costs money. Keep the passwords you create in a password manager.

You never need to send Claude a password or secret key. The only two values to send back are in step 8, and they are public.

## 1. Create the Supabase project (10 min)

1. Go to [supabase.com](https://supabase.com) and sign in with GitHub or the Aevigor Gmail.
2. **New project**: name `aevigor-beta`, region **Canada (Central)**, plan **Free**.
3. Let it generate a database password, and save it in your password manager.
4. Wait about 2 minutes for the project to start.

## 2. Create the database tables (5 min)

1. In the project, open **SQL Editor** › **New query**.
2. Open [the setup SQL file](../supabase/migrations/20261116000000_beta.sql), copy all of it, paste it in, and press **Run**. It should say "Success".

## 3. Turn on invite-only sign-up (2 min)

1. **Authentication** › **Hooks** › **Add hook** › **Before User Created**.
2. Type: **Postgres**, schema `public`, function `hook_before_user_created`. Save.

Anyone whose email is not on the invite list now gets "Aevigor is invite-only" when they try to sign up, with email or Google.

## 4. Sign-in settings (3 min)

1. **Authentication** › **URL Configuration**:
   - Site URL: `https://aevigor.com/beta/`
   - Redirect URLs: add `https://aevigor.com/beta/`
2. **Authentication** › **Sign In / Providers** › **Email**: keep it on, and keep **Confirm email** on. Set minimum password length to 8.

## 5. Emails from @aevigor.com with Resend (20 min)

Supabase's own email only sends a few messages an hour, so testers' confirmation and reset emails need this.

1. Sign up at [resend.com](https://resend.com) with the Aevigor Gmail.
2. **Domains** › **Add domain** › `aevigor.com`. Resend shows 3 or 4 DNS records.
3. In **Cloudflare** › aevigor.com › **DNS** › **Records**, add each one exactly as shown (Type, Name, Value). Set Proxy status to **DNS only** (grey cloud).
4. Back in Resend, press **Verify**. It can take a few minutes.
5. Resend › **API Keys** › **Create API key** (permission: Sending access). Copy it.
6. Supabase › **Authentication** › **Emails** › **SMTP Settings** › **Enable custom SMTP**:
   - Sender email `no-reply@aevigor.com`, sender name `Aevigor`
   - Host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key
7. Optional: in **Authentication** › **Emails** › **Templates**, change "Confirm signup" to mention Aevigor.

## 6. Sign in with Google (20 min)

1. In Supabase › **Authentication** › **Sign In / Providers** › **Google**, copy the **Callback URL** (it ends in `/auth/v1/callback`). Leave that page open.
2. Go to [console.cloud.google.com](https://console.cloud.google.com) with the Aevigor Gmail. Create a project called `Aevigor`.
3. **Google Auth Platform** (or **APIs & Services › OAuth consent screen**):
   - Branding: app name `Aevigor`, support email = Aevigor Gmail, home page `https://aevigor.com`, privacy policy `https://aevigor.com/legal/privacy.html`, terms `https://aevigor.com/legal/terms.html`, authorised domain `aevigor.com`.
   - Audience: **External**, then **Publish app**. Only the basic email and profile permissions are used, so Google does not need to review it.
4. **Clients** › **Create client** › **Web application**:
   - Authorised JavaScript origins: `https://aevigor.com`
   - Authorised redirect URIs: paste the Supabase Callback URL from step 1
5. Copy the **Client ID** and **Client secret** into the Supabase Google page, switch Google on, and save.

## 7. Let GitHub deploy the server code (10 min)

1. Supabase › your account menu › **Access Tokens** ([direct link](https://supabase.com/dashboard/account/tokens)) › **Generate new token** named `github`. Copy it.
2. GitHub › `biometric-grid` › **Settings** › **Secrets and variables** › **Actions** › **New repository secret**. Add these 4:

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | the token from step 1 |
| `SUPABASE_PROJECT_REF` | your project ID: the letters before `.supabase.co` in the project URL (Project Settings › General) |
| `BETA_ENCRYPTION_KEY` | a new random password, 40+ characters, from your password manager. **Save it and never change it** (changing it means every tester has to reconnect intervals.icu) |
| `BETA_CRON_SECRET` | another new random password, 40+ characters |

## 8. Send Claude two public values

From Supabase › **Project Settings** › **API** (or **API Keys**), send in the thread:

- the **Project URL** (`https://….supabase.co`)
- the **anon** / **publishable** key

These are meant to be public: they only allow what the database's privacy rules allow. Claude puts them in `beta/config.js`.

## 9. Go live

1. Merge the pull request. GitHub Pages publishes aevigor.com/beta and the "Beta server" workflow deploys the server code.
2. GitHub › **Actions** › **Beta server** › check the run is green. If you added the secrets after merging, press **Run workflow** once.

## 10. Invite people

In Supabase › **SQL Editor**, run one line per person (lowercase emails):

```sql
insert into public.invites (email, note) values ('you@example.com', 'owner');
insert into public.invites (email, note) values ('friend@example.com', 'pilot');
```

Then send them the link **aevigor.com/beta**. They tap **Create your account** (or Continue with Google), confirm their email, accept the privacy notice and connect intervals.icu.

Start with yourself and 2 or 3 people for about a week, then invite the rest.

To remove someone: Supabase › **Authentication** › **Users** › the person › **Delete user** (this deletes all their data), and delete their row from `invites`.

## Before inviting anyone

- Read the draft [beta privacy notice](../legal/beta-privacy.html) and [beta terms](../legal/beta-terms.html) and tell Claude what to change.
- Send intervals.icu a short note that a small free beta has people using their own API keys (Claude can draft it).
