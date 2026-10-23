import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'

// /games without the slash: on to /games/ (static hosts do this for folders, the dev and preview servers
// don't; a #level on the end carries over)
const toGames: Connect.NextHandleFunction = (req, res, next) => {
  const [path, query] = (req.url ?? '').split('?')
  if (path !== '/games') return next()
  res.statusCode = 302
  res.setHeader('Location', `/games/${query ? `?${query}` : ''}`)
  res.end()
}
const gamesSlash: Plugin = {
  name: 'games-slash',
  configureServer: (server) => void server.middlewares.use(toGames),
  configurePreviewServer: (server) => void server.middlewares.use(toGames),
}

// https://vite.dev/config/
// Two pages: the landing page (index.html, at /) and the games (games/index.html, at /games/)
export default defineConfig({
  plugins: [react(), gamesSlash],
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        games: fileURLToPath(new URL('./games/index.html', import.meta.url)),
      },
    },
  },
})
