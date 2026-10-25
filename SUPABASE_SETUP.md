# Supabase setup for Fallguy accounts

Players register and sign in with their **email and a password**, with no email to confirm for now, or play
as a **guest**. Registering asks for a username too; a guest who registers keeps their account. Every Party
Games show and Shoot Out match played signed in is kept, and shown on the account page (**Settings → Stats**).
This is what the Supabase project needs for that. Everything is in the dashboard at
https://supabase.com/dashboard → your project.

(Signing in with an emailed **6-digit code** instead of a password is built in too, but switched off for now:
see [Later: email codes](#later-email-codes) at the end.)

The site already has the project's keys in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

---

## 1. Sign-in settings

**Authentication → Sign In / Providers**

- **Allow new users to sign up**: on
- **Allow anonymous sign-ins**: on (for "Play as a guest")
- **Confirm email**: **off**. Registering then makes the account and signs the player straight in, with no
  email to confirm. (Left on, registering says the account still needs confirming from the email.)

Then open the **Email** provider on the same page:

- **Enable Email provider**: on
- **Minimum password length**: `6` (the sign-up form asks for at least 6; if you raise it, change
  `PASSWORD_MIN` in `src/landing/auth.ts` to match)

Save.

## 2. Unique usernames

**SQL Editor → New query**, paste all of `supabase/setup.sql`, and **Run**. It makes a `profiles` table that
holds each player's username, keeps them unique (whatever the letter case), and lets the sign-up form check a
username's free before it makes the account. It's safe to run again.

(Without it, accounts still work, but two players could pick the same username.)

## 3. Game stats

**SQL Editor → New query**, paste all of `supabase/game_results.sql`, and **Run**. It makes a `game_results`
table with a row for every game played signed in (guests included):

- **Party Games**: one row per round of a show (`/games/?mode=party-games&show=1`): the map, which round,
  whether you went **through**, went **out**, or **won** the final, your place out of how many, and the time.
- **Shoot Out**: one row per match (`/games/?mode=shoot-out`): **won** or **lost**, the score, your takedowns
  and how often you were taken down, and how long it took.

Each player can only add and read their own rows. Games left before they end aren't kept. It's safe to run
again. To see everyone's: **Table Editor → game_results**.

## 4. Bot difficulty presets

**SQL Editor → New query**, paste all of `supabase/bot_presets.sql`, and **Run**. It makes a `bot_presets`
table with three presets, Easy, Normal and Hard, Normal ticked as the default (how the bots have always
played). It's safe to run again: it won't overwrite presets you've changed.

To change how the bots play, open **Table Editor → bot_presets** and edit a row. The next match anyone starts
uses it: no code change, no deploy.

Once skill ratings are set up (section 5), the bots adapt to each player and play **between** Easy, Normal,
Hard and Elite (the rows named `easy`, `normal`, `hard` and `elite`), so editing those rows changes what each
level means. The `is_default` preset is only used when adapting is switched off.

- **Use a different preset for everyone:** untick `is_default` on the current one, then tick it on another
  (only one can be ticked at a time).
- **Make a new one:** insert a row with a new `name` (lowercase, e.g. `beginner`).
- **Try one out without changing anything for anyone else:** add `?bots=<name>` to the games' address, e.g.
  `/games/?bots=hard#sky`.

What the numbers do (the database won't accept values outside these ranges):

| Column | What it does | Range |
| --- | --- | --- |
| `level_min`, `level_max` | How good each Party Games bot is: 0 slow and careless, 1 quick and sharp. Each bot gets a level somewhere between the two. | 0 – 1 |
| `quickness_min`, `quickness_max` | How quick off the line each one is after "Go". | 0 – 1 |
| `speed` | Times their running speed. | 0.5 – 1.15 |
| `mistakes` | Times how often they slip up, misjudge a jump or let their mind wander. 0 never, 2 twice as often. | 0 – 5 |
| `reaction` | Times how long they take to react to what's coming. 2 is twice as slow, 0.5 twice as quick. | 0.2 – 4 |
| `shooter_skill_min`, `shooter_skill_max` | How good each Shoot Out bot is (aim and reaction): 0.6 slow and wild, 1 quick and steady. | 0.4 – 1 |

Without the table (or without a connection), the games use the presets they last read, or the built-in ones.
Each game kept in `game_results` notes the preset it was played with (`bot_preset`).

## 5. Skill ratings and adaptive bots

**SQL Editor → New query**, paste all of `supabase/skill.sql`, and **Run** (after `game_results.sql` and
`bot_presets.sql`). It's safe to run again. It adds:

- **A rating for every signed-in player**, one for Party Games and one for Shoot Out, in `player_skill`. Every
  show or match they finish moves it. The account page (**Settings → Stats**) shows it, times 1000: 500 plays
  like the Normal bots, 1000 like Hard. New players start at 350.
- **Bots that play at each player's rating.** After 2 or more bad games in a row (Party Games: out before the
  final; Shoot Out: a lost match) the bots ease off a little, until the player has a good one. In Party Games
  that's only in the qualifying rounds, so it can help a player into the final, but the final's played at their
  rating. After 2 or more good games in a row the bots push back a little. Leaving part way counts as a loss.
- **Online shows:** the bulk of the bots play for the player in the show who needs it easiest, and the best few
  for the one who needs it hardest, so the weaker player has a field to get through and the stronger one has
  competition at the front.
- **An `elite` bot preset**, past Hard, for the best players.
- **`skill_settings`**, one row with every number the ratings go by. Change it in the Table Editor (no deploy):

| Column | What it does | Starts at |
| --- | --- | --- |
| `adaptive` | Bots adapt to each player. Off: everyone gets the `is_default` preset. | on |
| `start_rating` | A new player's rating (×1000 on the account page). | 0.35 |
| `k_new`, `k_settled`, `settle_games` | How far one game moves a new player's rating, and a regular's, and over about how many games it goes from one to the other. | 0.20, 0.05, 12 |
| `k_rusty`, `rusty_days` | At least this much, back after this many days away. | 0.12, 14 |
| `scale` | How far apart a rating and a difficulty make a game a sure thing (smaller: ratings move more on surprises). | 0.15 |
| `mercy_2`, `mercy_3`, `mercy_5` | How much the bots ease off after 2, 3 and 5 bad games in a row (taken off the difficulty). | 0.08, 0.15, 0.20 |
| `hot_2`, `hot_3` | How much they push back after 2 and 3 good games in a row. | 0.05, 0.10 |
| `max_rating` | The top of the scale (Elite). | 1.25 |

Only games played after this is set up are rated (games kept before it don't count). Players who aren't
signed in are rated the same way in their own browser.

## 6. Site address

**Authentication → URL Configuration**

- **Site URL**: where the site lives in production, e.g. `https://yourdomain.com`
- **Redirect URLs**: add `http://localhost:5173/**` for development

(Passwords don't use these, but Supabase puts the Site URL into any emails and links it sends.)

## 7. Tidy up

**Authentication → Users**: if there's a user called `qa_whirl_7341` (from testing the old username sign-up),
delete it.

## 8. Try it

Run the site (`npm run dev`), open http://localhost:5173 and:

1. **Register**: a username, your email and a password → **Create account** → you're in. The navbar shows
   the balance, **Connect Wallet** and your initials.
2. **Sign out** (profile → Logout → This Device), then **Sign in** with the same email and password.
3. Play a **Party Games** show or a **Shoot Out** match, then open the profile → **Stats**: your games, and
   your rating.
4. **Play as a guest**, then **Register** from the profile page: the same account gets your username, email
   and password (and keeps the guest's games).

If something's off, the sign-in dialog says what (for example that a setting above is still switched on).

---

## Later: email codes

To go back to signing in with an emailed code (no passwords), set `EMAIL_CODES = true` in
`src/landing/auth.ts`, and set the project up for it as below.

### Sign-in settings

**Authentication → Sign In / Providers**: **Confirm email** on (entering the code is what confirms it). In
the **Email** provider:

- **Email OTP Length**: `6` (the game expects 6; if you change it, change `CODE_LENGTH` in `src/landing/auth.ts`)
- **Email OTP Expiration**: `600` seconds (10 minutes) is a good choice; the default is an hour
- **Secure email change**: leave on

### Email templates (codes instead of links)

By default Supabase emails a link; the game needs the **code**, which templates show as `{{ .Token }}`.

**Authentication → Emails → Templates**, then for each of these three:

| Template | Subject | Body (paste the whole file) |
| --- | --- | --- |
| **Confirm signup** | `Your Fallguy sign-up code` | `supabase/templates/confirm-signup.html` |
| **Magic Link** | `Your Fallguy sign-in code` | `supabase/templates/magic-link.html` |
| **Change Email Address** | `Confirm your email for Fallguy` | `supabase/templates/change-email.html` |

Which one goes out when: a new player registering gets **Confirm signup**; signing in gets **Magic Link**; a
guest registering gets **Change Email Address** (their guest account is given the email). Save each one.

### Sending email for real (SMTP)

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
