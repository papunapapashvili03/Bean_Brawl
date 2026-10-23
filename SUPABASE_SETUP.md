# Supabase setup for Fallguy accounts

Players sign in and register with their **email and a 6-digit code** (no passwords), or play as a **guest**.
Registering asks for a username too; a guest who registers keeps their account. This is what the Supabase
project needs for that. Everything is in the dashboard at https://supabase.com/dashboard → your project.

The site already has the project's keys in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

---

## 1. Sign-in settings

**Authentication → Sign In / Providers**

- **Allow new users to sign up**: on
- **Allow anonymous sign-ins**: on (for "Play as a guest")
- **Confirm email**: on (entering the code is what confirms it)

Then open the **Email** provider on the same page:

- **Enable Email provider**: on
- **Email OTP Length**: `6` (the game expects 6; if you change it, change `CODE_LENGTH` in `src/landing/auth.ts`)
- **Email OTP Expiration**: `600` seconds (10 minutes) is a good choice; the default is an hour
- **Secure email change**: leave on

Save.

## 2. Email templates (codes instead of links)

By default Supabase emails a link; the game needs the **code**, which templates show as `{{ .Token }}`.

**Authentication → Emails → Templates**, then for each of these three:

| Template | Subject | Body (paste the whole file) |
| --- | --- | --- |
| **Confirm signup** | `Your Fallguy sign-up code` | `supabase/templates/confirm-signup.html` |
| **Magic Link** | `Your Fallguy sign-in code` | `supabase/templates/magic-link.html` |
| **Change Email Address** | `Confirm your email for Fallguy` | `supabase/templates/change-email.html` |

Which one goes out when: a new player registering gets **Confirm signup**; signing in gets **Magic Link**; a
guest registering gets **Change Email Address** (their guest account is given the email). Save each one.

## 3. Sending email for real (SMTP)

Supabase's built-in email is only for trying things out: it sends **only to the project team's own
addresses**, and only a few an hour. Real players need your own email service:

1. Sign up with an email provider, for example [Resend](https://resend.com) (free tier), Postmark,
   SendGrid or Amazon SES.
2. Verify a domain you own with them (they give you DNS records to add), and make an SMTP password / API key.
3. In Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**, and fill in:
   - **Sender email**: e.g. `no-reply@yourdomain.com`; **Sender name**: `Fallguy`
   - **Host / Port / Username / Password**: from the provider (Resend: host `smtp.resend.com`, port `465`,
     username `resend`, password = your API key)
4. **Authentication → Rate Limits**: raise **Rate limit for sending emails** (e.g. to 100 an hour) once
   custom SMTP is on.

Until then you can test with your own email address if you're on the project team.

## 4. Unique usernames

**SQL Editor → New query**, paste all of `supabase/setup.sql`, and **Run**. It makes a `profiles` table that
holds each player's username, keeps them unique (whatever the letter case), and lets the sign-up form check a
username's free before it emails a code. It's safe to run again.

(Without it, accounts still work, but two players could pick the same username.)

## 5. Site address

**Authentication → URL Configuration**

- **Site URL**: where the site lives in production, e.g. `https://yourdomain.com`
- **Redirect URLs**: add `http://localhost:5173/**` for development

(Codes don't use these, but Supabase puts the Site URL into emails and uses it for any links.)

## 6. Tidy up

**Authentication → Users**: if there's a user called `qa_whirl_7341` (from testing the old username sign-up),
delete it.

## 7. Try it

Run the site (`npm run dev`), open http://localhost:5173 and:

1. **Register**: a username and your email → **Send code** → the code from the email → you're in. The navbar
   shows the balance, **Connect Wallet** and your initials.
2. **Sign out** (profile → Logout → This Device), then **Sign in** with the same email and a new code.
3. **Play as a guest**, then **Register** from the profile page: the same account gets your username and email.

If something's off, the sign-in dialog says what (for example that a setting above is still switched off).
