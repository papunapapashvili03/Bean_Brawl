# Online play

Two ways to play together, each player on their own device. The server is `server/` (a small Node WebSocket
server); the game's side is `src/game/net/`.

- **Party Games**: Play on the Party Games page joins a show with other players. The lobby waits **30 seconds**
  for players (up to **10**; a full lobby starts 3 seconds later), then everyone plays the show's three rounds
  together, the rest of the 24–30 field bots.
- **Playground**: anyone who opens it drops into the same playground and can run about together.

## Try it on your own network

1. Once: `npm install --prefix server`
2. In one terminal: `npm run server` (the game server, port 2567)
3. In another: `npm run dev:lan` (the site, reachable from other devices). It prints a **Network** address,
   e.g. `http://192.168.1.20:5173/`.
4. On each device, open that address, then **Party Games → Play**. (Or add `games/#playground` to the address
   for the playground.)

If `.env.local` has `VITE_MP_URL` (the Railway server), the game uses that instead: add `?mp=local` to the
games' address to use the one on your computer, e.g.
`http://192.168.1.20:5173/games/?mode=party-games&show=1&online=1&mp=local`.

If Windows asks whether to allow Node.js on the network, allow it on **private networks** (both the site and
the server need it). To feel what lag does, add `&lag=150` (milliseconds) to the games' address (and
`&jitter=40` for uneven lag).

Two tabs in the same browser can play each other too, but a browser only draws the tab in front: the one
behind barely moves until it's in front.

## Put the server on Railway

The server needs nothing but Node; Railway runs `npm start` and gives it a port.

**With the Railway CLI** (no GitHub needed):

1. `npm install -g @railway/cli`, then `railway login`
2. `cd server`, then `railway init` (makes a new project; or `railway link` to use an existing one)
3. `railway up` (uploads and starts it)
4. `railway domain` (gives it a public address like `fallguy-server-production.up.railway.app`)
5. Check it: open `https://<that address>/` in a browser; it should say `ok`, with how many are in the
   playground, in lobbies and in shows.

**Or from GitHub:** push the project, then in Railway: New → GitHub repo → this repo, and under the service's
Settings set **Root Directory** to `/server`. Then Settings → Networking → **Generate Domain**.

Then point the game at it: in `.env.local` add

```
VITE_MP_URL=wss://<that address>
```

and restart `npm run dev` (or `npm run dev:lan`). When the site itself is put online, its build needs the same
`VITE_MP_URL`.

**Updating:** when the server changes, deploy it **before** the site. A site newer than its server can't play
online: Party Games says the server isn't starting shows (and offers a game with bots instead), and the
playground doesn't show other players.

## How a show works online

- **The lobby.** The server keeps one lobby open at a time. The first player in starts its 30 seconds; when they
  run out (or 10 have joined), the show starts with whoever's there, even one player.
- **The same show on every screen.** The server gives the lobby a seed, and every player's screen makes the
  same show from it: the three maps, the bots and how good each is, and, each round, everything left to
  chance (which doors are real, which colour's called, the walls, the strike patterns, the pillars).
- **The same clock.** Each round's clock starts at the same moment on every screen, by the server's clock
  (worked out from the pings). A screen that falls behind (a stall, or a hidden tab) jumps forward to catch up.
- **The bots.** One player, the **host**, runs the bots for everyone and sends where they are, 10 times a
  second; every other screen draws them from that. If the host leaves, or its page is hidden or barely being
  drawn (another tab, another app), another player takes over and the bots carry on from where they were.
- **How hard the bots play.** Each player says how hard it needs them as it queues (from its skill rating: see
  SUPABASE_SETUP.md, section 5). Each round, the bulk of the bots play for the player who needs it easiest and
  the best few for the one who needs it hardest; the final's set by the finalists' ratings alone.
- **Who goes through.** Each player tells the server when it gets home (or goes out), and the host tells it
  about the bots. Once the quota's home (16, then 10), the server orders everyone by their finishing time
  and announces who's through. After a 5-second break, everyone still in starts the next round together.
  Players who aren't through are out of the show. The final is each player's own: win it on your screen and
  you've won the show.
- **Coming back.** A player whose connection drops, or who reloads the page, gets back into the round they
  were in (within 20 seconds), as long as the show's still on that round.

## What this is, and isn't, yet

- Each player sends their own bean's position and moves about 20 times a second; the server passes them on.
  Other players are drawn a tenth of a second behind, smoothed between updates. The bots, sent less often,
  a little more behind than that.
- Other players' beans, and on most screens the bots, are solid: you bump into them (they don't get pushed
  by you). Things that react to runners (tiles that drop, walls that break, the seesaws) react to them as
  they're drawn on your screen, so the timing can differ slightly between screens.
- Some hazards still aren't shared: the Jungle Gym's falling shapes, the Crumbling Tower's lightning and
  rubble. Each player gets their own.
- The playground's loose shapes, cars, guns and targets are each player's own: they aren't shared, so they
  can be in different places on different screens.
- The server trusts each player with their own position and finishing time: fine for playing together, not
  for prizes.
- A full show (10 players) is roughly 450 KB a second out of the server, mostly passing beans and bots on:
  worth batching the messages (and sending far-off beans less often) before it gets busy.
