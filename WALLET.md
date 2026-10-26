# Wallet and stakes (SOL)

Players keep a **SOL balance on the site**. They put SOL in from their own Solana wallet (Phantom, Solflare,
Backpack…), stake it on Party Games shows, and take it out again to the wallet they've linked. It runs on
**devnet** (test SOL, no real money) until it's switched to mainnet.

- **Balance and Connect Wallet** (navbar) open the wallet: the balance, connecting a wallet, linking it to the
  account (a signed message, free), Deposit, Withdraw and History.
- **Party Games → Stake**: Free, 0.01, 0.05 or 0.1 SOL. Each tier has its own lobby, so everyone in a show
  stakes the same. Playing for a stake needs a registered account (not a guest) with the balance for it.
- **As the show starts**, each player's stake comes off their balance. With fewer than 2 players staking, the
  show is played free and nothing is taken (they're told).
- **When it ends**, the pot less the site's **10%** goes to the players who came top, ranked among the
  players only (**bots never win money**): the winner takes it all with 2 players, the top 2 share it 70/30
  with 3–4, and the top 3 share it 50/30/20 with 5 or more. Players are ranked by how far they got in the show
  (the final's winner first, then by how long finalists lasted, then those out in round 2, then round 1);
  players who come equal share their places.
- **If the server stops part way through a show**, every stake is refunded as it starts again.
- **A deposit that takes a while to confirm** is kept in the browser and checked again until it's counted.

The pieces: `server/wallet.mjs` (deposits checked on the chain, withdrawals sent, stakes and payouts),
`supabase/wallet.sql` (balances, the ledger, and the only functions that can change them),
`src/landing/WalletPanel.tsx` and `src/landing/money.ts` (the wallet on the site), and the stakes in
`server/index.mjs` and `src/game/net/party.ts`.

## Setting it up (devnet), step by step

You need: the Supabase dashboard, the Railway dashboard, a terminal on your computer, and (to try it) the
Phantom wallet. Nothing here costs money: on devnet all SOL is free test SOL.

### 1. Supabase tables

SQL Editor → New query → paste all of `supabase/wallet.sql` → Run. To check: Table Editor lists `wallets`,
`balances`, `ledger` and `staked_shows`.

### 2. Make the house wallet (on your computer, once)

The house wallet is the site's own Solana wallet: deposits go into it, withdrawals are paid from it.

1. Open a terminal: in the Claude app, the Terminal panel; or Windows Start → type PowerShell → open it.
2. Go to the server folder:

   ```
   cd C:\Users\User\Desktop\Fallguy\server
   ```

3. Make the wallet:

   ```
   node scripts/house-wallet.mjs
   ```

   It prints two lines:

   ```
   New house wallet: 7xKXq…(about 44 letters and numbers)
   Its secret key is in C:\Users\User\Desktop\Fallguy\server\house-wallet.json: copy what's between the quotes …
   ```

   The first is the wallet's **address**: public, fine to share. Note it down.
4. Open `server\house-wallet.json` in Notepad (right-click → Open with → Notepad). It's one line in quotes,
   about 88 letters and numbers: that's the **secret key**. You'll paste what's between the quotes (not the
   quotes) into Railway in step 4.
5. Save a copy of the secret key in your password manager (as a secure note). If it's lost, any SOL in the
   house wallet is lost with it. Never paste it into a chat, Discord, GitHub, Vercel or the site's
   `.env.local`: anyone with it can take every player's SOL. The file itself is kept out of git.

If the command says the file is there already, you made one before: use that one rather than making another
(SOL sent to the old one would be left behind).

### 3. Get the Supabase values

In the Supabase dashboard, open the project, then **Project Settings** (the gear at the bottom left):

- **`SUPABASE_URL`**: Project Settings → **Data API** → **Project URL** (`https://<letters>.supabase.co`). It's
  the same as `VITE_SUPABASE_URL` in the site's `.env.local`.
- **`SUPABASE_SERVICE_ROLE_KEY`**: Project Settings → **API Keys**. Either of these works:
  - the **API Keys** tab → **Secret keys** → **+ Add new secret key** (name it e.g. `railway-server`) → copy it
    (it starts `sb_secret_`); or
  - the **Legacy API Keys** tab → **service_role** → **Reveal** → copy (it starts `eyJ`).

  This key gets past every rule that keeps players' data apart, so it goes on Railway only: never in the
  site, Vercel, `.env.local` or git. If it ever leaks, delete it there (or roll it) and make a new one.

(The `anon` / publishable key the site uses is a different one: don't use it here.)

### 4. Put them on Railway

1. Go to railway.com → sign in → open the project with the game server (the one whose address is
   `beanbrawl-production.up.railway.app`) → click the server's box.
2. Open its **Variables** tab → **+ New Variable**, and add these four (names exactly as written, values with
   no quotes or spaces):

   | Name | Value |
   | --- | --- |
   | `HOUSE_SECRET_KEY` | the secret key from step 2 |
   | `SUPABASE_URL` | the Project URL from step 3 |
   | `SUPABASE_SERVICE_ROLE_KEY` | the secret key from step 3 |
   | `SOLANA_NETWORK` | `devnet` |

   Optional: `SOLANA_RPC`, a devnet address from an RPC provider (Helius, QuickNode, Alchemy: free plans). The
   public one Solana runs is used otherwise; it's fine to start with but limits how many requests it takes.
3. Railway holds the changes until you apply them: click **Deploy** (or **Apply changes**) at the top. The
   server restarts with them.

### 5. Put the new server code on Railway

The wallet code has to be on GitHub for Railway to run it (ask for a commit and push). Then:

- If Railway deploys from GitHub (the server's **Settings** tab shows the repository under **Source**), it
  redeploys by itself after the push.
- If you deploy with the Railway CLI, in the server folder run `railway up`.

The site (Vercel) updates from the same push. For a minute or two one may be newer than the other; that's
harmless (the wallet just says it can't reach the server till both are up).

### 6. Check it's on

- Railway → the server → **Deployments** → the newest → **View logs**. Look for:

  ```
  Money on devnet: house wallet <your address>, balances in Supabase
  ```

  If it says `No money on this server`, a variable's missing or misspelled. If it says `HOUSE_SECRET_KEY is not
  a secret key`, the value was pasted with its quotes or cut short.
- Open https://beanbrawl-production.up.railway.app/wallet/config in a browser. It should show
  `"on":true,"network":"devnet","house":"<your address>"`.

### 7. Give the house wallet some test SOL

Withdrawals pay a tiny network fee from the house wallet. Go to https://faucet.solana.com, paste the house
wallet's address, pick **Devnet**, and ask for 1 SOL. (Signing in there with GitHub lets you ask for more, more
often.)

### 8. Try it with Phantom

1. Install Phantom from https://phantom.com (the browser extension, or the app on a phone) and make a new
   wallet. Keep its recovery phrase safe like any wallet's, even for testing.
2. Phantom → **Settings** → **Developer Settings** → turn on **Testnet Mode**, and choose **Solana Devnet**.
3. Copy your Phantom address (click the wallet's name at the top) → https://faucet.solana.com → paste it →
   Devnet → 1 SOL.
4. On the site, sign in with a registered account (guests can't hold SOL).
5. Click the balance (or **Connect Wallet**) in the navbar → **Phantom** → approve the connection.
6. **Link this wallet** → Phantom asks you to sign a message → **Sign** (it's free, nothing's sent).
7. **Deposit** → 0.1 → **Deposit 0.1 SOL** → approve in Phantom. After 10–30 seconds the balance shows 0.1000.
8. **Withdraw** → 0.05 → **Withdraw**: it arrives in Phantom within seconds, with a link to the explorer.
9. A staked show takes two players with a balance: a second account in another browser (or a phone), both pick
   the same stake on the Party Games page and press Play within 30 seconds of each other. When the show's
   over, the winnings are in the wallet's **History**.

### If something's wrong

- **The wallet says it can't reach the game server**: the server isn't updated yet (step 5), or Railway is
  restarting.
- **"Playing for SOL isn't switched on yet"**: the server's running without its variables (step 6 says which).
- **A deposit isn't counted** (devnet can be slow): it's kept, and checked again whenever the wallet opens; or
  press **Check again**. The SOL is in the house wallet either way.
- **Phantom isn't listed**: reload the page after installing it, and check the extension's switched on.
- **"The site can't pay that out right now"**: the house wallet is low (step 7).
- **"The withdrawal was sent, but its confirmation didn't come back"**: look in Phantom or on the explorer in a
  minute; the server's log has it too (`Check it by hand`).

## Trying it out without any SOL (on this computer)

`server/money-dev.local` is a settings file for a server in its try-it-out mode (balances in memory, a
throwaway house wallet). Start the server with `node --env-file=server/money-dev.local server/index.mjs` (or the
`game-server-money-dev` launch config), then open `http://localhost:5173/?mp=local&devuser=alice#party-games`.
`devuser` is a test player (developing only, no account needed), and the wallet has an **Add 0.5 test SOL**
button. Open a second tab with `devuser=bob` to play a staked show between the two.

## Before real money (mainnet)

Switching is one setting (`SOLANA_NETWORK=mainnet-beta`, with a new house wallet), but these come first:

1. **Results the server can trust.** Each player's own browser still reports when it finished or went out, and
   the server believes it: anyone could claim a win from the browser's console and take the pot. The server
   has to check results itself (for example by replaying each player's inputs, or checking their reported
   positions against the course) before real SOL is staked.
2. **Legal review.** Staking money on games is regulated differently in each country (gambling, skill gaming,
   money transmission for holding players' balances). Expect age limits (18+), identity checks above some
   amounts, country blocks, and terms that explain the stakes, the fee and the adaptive bots.
3. **Security.** Move the house wallet's key into a proper secret store (or a hardware/multisig wallet with
   only a small hot wallet for withdrawals), add withdrawal limits and alerts, two-factor sign-in, and a review
   of `server/wallet.mjs` and `supabase/wallet.sql` by someone else.
4. **Reconciliation.** A check, now and then, that the house wallet holds at least everyone's balances added
   up, and a look at any withdrawal the server couldn't confirm (it logs them: `Check it by hand`).
