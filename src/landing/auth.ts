import { useMemo, useSyncExternalStore } from 'react'
import type { AuthError, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Accounts, through Supabase auth (./supabase), two ways in (see SUPABASE_SETUP.md for the project's side):
// - by email: for now with a password, and no email to confirm (Supabase's "Confirm email" switched off), so
//   registering makes the account and signs you straight in; registering, you pick a username too. Or, with
//   EMAIL_CODES on, with a code instead: Supabase emails a one-time code (the email templates show
//   {{ .Token }}) and entering it signs you in (the account's made as the code's checked). Usernames are kept
//   unique by the `profiles` table (supabase/setup.sql), where it exists.
// - as a guest: an anonymous Supabase user with a made-up name like guest123. A guest registering keeps the
//   account: the email (and password) are added to it along with the username.
// The actions resolve to an error message for the person, or null when it worked.

// Emailed codes, rather than passwords: switched off for now (the code for them is all still here)
export const EMAIL_CODES = false

export type AccountKind = 'email' | 'guest'

export type Account = {
  id: string
  kind: AccountKind
  name: string // what to call them
  username: string | null
  email: string | null
  avatarUrl: string | null
  createdAt: string
  lastSignInAt: string | null
}

// What a code was sent for: signing in (or up), or a guest adding an email to their account
export type CodeFor = 'email' | 'email_change'

export const USERNAME_RULE = /^[A-Za-z0-9_]{3,20}$/
export const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const CODE_LENGTH = 6 // Supabase's "Email OTP Length" (it can be set as long as 10)
export const RESEND_AFTER = 60 // seconds: Supabase sends one email a minute to each address, at most
export const NAME_MAX = 24
export const PASSWORD_MIN = 6 // Supabase's default minimum

const guestName = () => `guest${Math.floor(100 + Math.random() * 900)}`

function accountOf(user: User): Account {
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>
  const base = { id: user.id, createdAt: user.created_at, lastSignInAt: user.last_sign_in_at ?? null, avatarUrl: meta.avatar_url ?? null }
  if (user.is_anonymous) return { ...base, kind: 'guest', name: meta.display_name ?? 'guest', username: null, email: null }
  const email = user.email ?? null
  const username = meta.username ?? null
  return { ...base, kind: 'email', name: meta.display_name || username || email?.split('@')[0] || 'player', username, email }
}

// ---------------------------------------------------------------------------------------------------------
// Who's signed in, kept up to date from Supabase

let state: { ready: boolean; user: User | null } = { ready: !supabase, user: null }
const listeners = new Set<() => void>()

supabase?.auth.onAuthStateChange((_event, session) => {
  state = { ready: true, user: session?.user ?? null }
  listeners.forEach((l) => l())
})

// `ready` turns true once the saved session (if any) has been looked at; `configured` is false without keys
export function useAuth() {
  const { ready, user } = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => state,
  )
  const account = useMemo(() => (user ? accountOf(user) : null), [user])
  return { ready, account, configured: !!supabase }
}

// ---------------------------------------------------------------------------------------------------------
// Signing in and out, and changing your account

const NOT_CONFIGURED = 'Accounts aren’t set up yet: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.'
const TAKEN = 'That username is taken.'
const STILL_CONFIRMING = 'Your account’s made, but Supabase is still set to confirm emails first: confirm it from the email, or switch “Confirm email” off (see SUPABASE_SETUP.md).'

// What went wrong, for the person. (`registering`: a database error then means the username's taken: the
// profiles table refused it, see supabase/setup.sql.)
function explain(error: AuthError, registering = false): string {
  if (error.name === 'AuthRetryableFetchError') return 'Couldn’t reach the sign-in server. Check your connection and try again.'
  if (registering && (error.code === 'unexpected_failure' || /database error/i.test(error.message))) return TAKEN
  if (/signups not allowed/i.test(error.message)) return 'There’s no account with that email yet. Register instead.'
  switch (error.code) {
    case 'otp_disabled':
    case 'user_not_found':
      return 'There’s no account with that email yet. Register instead.'
    case 'otp_expired':
      return 'That code is wrong or has expired. Check it, or send a new one.'
    case 'invalid_credentials':
      return 'That email and password don’t match an account.'
    case 'user_already_exists':
      return 'That email already has an account. Sign in with it instead.'
    case 'weak_password':
      return `That password’s too weak: use at least ${PASSWORD_MIN} characters.`
    case 'email_not_confirmed':
      return 'That account’s email isn’t confirmed yet. (Switch “Confirm email” off in Supabase to skip that: see SUPABASE_SETUP.md.)'
    case 'email_exists':
      return 'That email already has an account. Sign in with it instead (this guest account won’t carry over).'
    case 'email_address_invalid':
      return 'That email address doesn’t look right.'
    case 'email_address_not_authorized':
      return 'Codes can’t be emailed to that address yet: Supabase’s built-in email only sends to the project’s team (set up SMTP).'
    case 'over_email_send_rate_limit':
      return 'Too many emails sent just now. Wait a minute and try again.'
    case 'over_request_rate_limit':
      return 'Too many tries. Wait a moment and try again.'
    case 'anonymous_provider_disabled':
      return 'Guest play isn’t switched on yet (enable Anonymous sign-ins in Supabase).'
    case 'email_provider_disabled':
      return 'Email sign-in isn’t switched on yet (enable the Email provider in Supabase).'
    case 'signup_disabled':
      return 'Registering is switched off right now.'
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'You’ve been signed out. Sign in again.'
    default:
      return error.message
  }
}

export function checkUsername(username: string) {
  return USERNAME_RULE.test(username) ? null : 'Usernames are 3–20 letters, numbers or underscores.'
}

export function checkEmail(email: string) {
  return EMAIL_RULE.test(email) ? null : 'Enter your email address.'
}

export function checkCode(code: string) {
  return /^\d{6,10}$/.test(code) ? null : `Enter the ${CODE_LENGTH}-digit code from the email.`
}

export function checkPassword(password: string) {
  return password.length >= PASSWORD_MIN ? null : `Passwords are at least ${PASSWORD_MIN} characters.`
}

export function checkName(name: string) {
  const n = name.trim()
  if (!n) return 'Your name can’t be empty.'
  return n.length <= NAME_MAX ? null : `Names are at most ${NAME_MAX} characters.`
}

// Whether someone has the username already (by the profiles table; without it, nobody has)
async function usernameTaken(username: string) {
  const { data, error } = await supabase!.rpc('username_taken', { name: username })
  return !error && data === true
}

// ---------------------------------------------------------------------------------------------------------
// With a password (for now: EMAIL_CODES off)

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) return NOT_CONFIGURED
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? explain(error) : null
}

// Registering: the account's made and you're signed in, there and then (with "Confirm email" off). A guest
// registering keeps their account: the email, password and username are added to it.
export async function registerWithPassword(username: string, email: string, password: string) {
  if (!supabase) return NOT_CONFIGURED
  if (await usernameTaken(username)) return TAKEN
  const data = { username, display_name: username }
  const { data: current } = await supabase.auth.getSession()
  if (current.session?.user.is_anonymous) {
    const { data: updated, error } = await supabase.auth.updateUser({ email, password, data })
    if (error) return explain(error, true)
    if (updated.user?.email !== email) return STILL_CONFIRMING
    return null
  }
  const { data: made, error } = await supabase.auth.signUp({ email, password, options: { data } })
  if (error) return explain(error, true)
  // (With "Confirm email" still on there's no session yet, and for an email that already has an account
  // Supabase says nothing either, to not give away who's registered)
  if (!made.session) return made.user?.identities?.length === 0 ? 'That email already has an account. Sign in with it instead.' : STILL_CONFIRMING
  return null
}

// ---------------------------------------------------------------------------------------------------------
// With a code by email (EMAIL_CODES on)

// Signing in: a code to the email, if there's an account with it
export async function sendSignInCode(email: string) {
  if (!supabase) return NOT_CONFIGURED
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  return error ? explain(error) : null
}

// Registering: a code to the email, the account made once it's entered (an email that already has one just
// signs in to it). A guest registering keeps their account: the email's added to it, confirmed by a code.
export async function sendRegisterCode(username: string, email: string): Promise<{ problem: string | null; codeFor: CodeFor }> {
  if (!supabase) return { problem: NOT_CONFIGURED, codeFor: 'email' }
  if (await usernameTaken(username)) return { problem: TAKEN, codeFor: 'email' }
  const data = { username, display_name: username }
  const { data: current } = await supabase.auth.getSession()
  if (current.session?.user.is_anonymous) {
    const { error } = await supabase.auth.updateUser({ email, data })
    return { problem: error ? explain(error, true) : null, codeFor: 'email_change' }
  }
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, data } })
  return { problem: error ? explain(error, true) : null, codeFor: 'email' }
}

// The code from the email: signs in (making the account, registering), or confirms a guest's new email
export async function verifyCode(email: string, code: string, codeFor: CodeFor) {
  if (!supabase) return NOT_CONFIGURED
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: codeFor })
  return error ? explain(error) : null
}

export async function playAsGuest() {
  if (!supabase) return NOT_CONFIGURED
  const { error } = await supabase.auth.signInAnonymously({ options: { data: { display_name: guestName() } } })
  return error ? explain(error) : null
}

export async function changeName(name: string) {
  if (!supabase) return NOT_CONFIGURED
  const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } })
  return error ? explain(error) : null
}

// Sign out here, or everywhere this account is signed in
export async function signOut(scope: 'local' | 'global') {
  if (!supabase) return NOT_CONFIGURED
  const { error } = await supabase.auth.signOut({ scope })
  return error ? explain(error) : null
}
