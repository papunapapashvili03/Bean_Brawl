# Online play (playground test)

Two or more people in the same **Playground**, each on their own device, seeing each other's beans move,
jump, roll, hang and change outfits. The server is `server/` (a small Node WebSocket server); the game's side
is `src/game/net/`.

## Try it on your own network

You need two **computers** on the same Wi-Fi or network: the game has no touch controls yet, so a phone can
join and watch, but can't move its bean.

1. Once: `npm install --prefix server`
2. In one terminal: `npm run server` (the game server, port 2567)
3. In another: `npm run dev:lan` (the site, reachable from other devices). It prints a **Network** address,
   e.g. `http://192.168.1.20:5173/`.
4. On each device, open that address followed by `games/#playground`, e.g.
   `http://192.168.1.20:5173/games/#playground`.

The top right shows **Online**, your ping, and who's here. If Windows asks whether to allow Node.js on the
network, allow it on **private networks** (both the site and the server need it).

To feel what lag does, add `?lag=150` (milliseconds) before the `#`, e.g.
`.../games/?lag=150#playground` (and `&jitter=40` for uneven lag).

## Put the server on Railway

The server needs nothing but Node; Railway runs `npm start` and gives it a port.

**With the Railway CLI** (no GitHub needed):

1. `npm install -g @railway/cli`, then `railway login`
2. `cd server`, then `railway init` (makes a new project; or `railway link` to use an existing one)
3. `railway up` (uploads and starts it)
4. `railway domain` (gives it a public address like `fallguy-server-production.up.railway.app`)
5. Check it: open `https://<that address>/` in a browser; it should say `ok`.

**Or from GitHub:** push the project, then in Railway: New → GitHub repo → this repo, and under the service's
Settings set **Root Directory** to `/server`. Then Settings → Networking → **Generate Domain**.

Then point the game at it: in `.env.local` add

```
VITE_MP_URL=wss://<that address>
```

and restart `npm run dev` (or `npm run dev:lan`). Now any two devices, on any networks, meet in the same
playground. When the site itself is put online, its build needs the same `VITE_MP_URL`.

## What this is, and isn't, yet

- Each player sends their own bean's position and moves about 20 times a second; the server passes them on.
  Other players are drawn a tenth of a second behind, smoothed between updates.
- Other players' beans are solid: you bump into them (they don't get pushed by you).
- The playground's loose shapes, cars, guns and targets are each player's own: they aren't shared, so they
  can be in different places on different screens.
- The server trusts each player with their own position: fine for testing, not for prizes.
- One room (`playground`), up to 30 players.
