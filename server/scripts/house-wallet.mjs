// Makes a new house wallet: the site's own Solana wallet, which players' deposits go to and withdrawals come
// from (see ../wallet.mjs). Run it once: `node scripts/house-wallet.mjs` (in the server folder).
//
// Its secret key goes into server/house-wallet.json (kept out of git), never onto the screen: put the file's
// contents into Railway as the HOUSE_SECRET_KEY variable, then keep the file somewhere safe offline (or
// delete it). Anyone with that key can take every player's SOL.

import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

const file = fileURLToPath(new URL('../house-wallet.json', import.meta.url))
if (existsSync(file)) {
  console.error(`${file} is there already: move it away first if you really want a new house wallet.`)
  process.exit(1)
}
const key = Keypair.generate()
writeFileSync(file, JSON.stringify(bs58.encode(key.secretKey)) + '\n', { mode: 0o600 })
console.log(`New house wallet: ${key.publicKey.toBase58()}`)
console.log(`Its secret key is in ${file}: copy what's between the quotes into Railway as HOUSE_SECRET_KEY.`)
