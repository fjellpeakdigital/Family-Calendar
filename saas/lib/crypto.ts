/**
 * AES-256-GCM encryption for OAuth tokens stored in the database.
 * The key never leaves the server. Clients never see encrypted or
 * plaintext tokens — all Google API calls are proxied server-side.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES  = 32 // 256 bits
const IV_BYTES   = 12 // 96-bit IV recommended for GCM
const TAG_BYTES  = 16

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string in the format: <iv>:<authTag>:<ciphertext>
 */
export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv  = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

/**
 * Decrypt a token produced by encryptToken().
 */
export function decryptToken(encoded: string): string {
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted token format')

  const [ivB64, tagB64, ctB64] = parts
  const key        = getKey()
  const iv         = Buffer.from(ivB64, 'base64')
  const tag        = Buffer.from(tagB64, 'base64')
  const ciphertext = Buffer.from(ctB64, 'base64')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8')
}
