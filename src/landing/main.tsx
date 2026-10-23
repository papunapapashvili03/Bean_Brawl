import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Landing } from './Landing'

// The landing page, at / (the games are at /games/, see ../main.tsx)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
)
