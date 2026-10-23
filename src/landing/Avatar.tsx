import { useState } from 'react'
import type { Account } from './auth'

// Someone's picture (if their account has one), or their initials on a coloured disc

function initials(name: string) {
  const words = name.split(/[\s_.-]+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}

export function Avatar({ account, large = false }: { account: Account; large?: boolean }) {
  const [broken, setBroken] = useState(false)
  const className = `avatar${large ? ' avatar-lg' : ''}`
  if (account.avatarUrl && !broken) {
    return <img className={className} src={account.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  }
  return <span className={className}>{initials(account.name)}</span>
}
