// The games, at /games/ (games/index.html); the landing page at / has its own entry (./landing/main.tsx)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadBotPresets } from './game/bots/presets'
import { loadSkill } from './game/bots/difficulty'

// (The bots' difficulty presets, and the player's skill rating, from Supabase: the levels wait a moment for
// them)
void loadBotPresets()
void loadSkill()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
