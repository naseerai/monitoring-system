/**
 * crypto.ts — AES-256-GCM symmetric encryption for SSH credentials.
 *
 * ⚠️  BACKEND ONLY — This file is imported exclusively by server.ts.
 *     It must never be imported by any file under src/components or src/context
 *     or it will be bundled into the Vite frontend build.
 *
 * Wire format (all base64url, colon-separated):
 *   <iv_b64>:<authTag_b64>:<ciphertext_b64>
 *
 * Detecting legacy plaintext:
 *   If the stored value does NOT contain ':' it is assumed to be a legacy
 *   plaintext credential.  decryptCredential() returns it as-is so that
 *   existing nodes continue to work while you re-save them through the UI.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES   = 12;   // 96-bit IV — NIST recommended for GCM
const TAG_BYTES  = 16;

function getDerivedKey(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error('[crypto] APP_SECRET is not set. Add it to your .env file.');
  }
  // Accept either 64-char hex (32 bytes) or a passphrase we stretch to 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  // Fallback: SHA-256 the passphrase so any string works
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext credential string.
 * Returns the wire-format string to store in Supabase.
 */
export function encryptCredential(plaintext: string): string {
  const key  = getDerivedKey();
  const iv   = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

/**
 * Decrypt a stored credential back to plaintext.
 * Gracefully handles legacy unencrypted credentials.
 */
export function decryptCredential(stored: string): string {
  // Legacy detection — no colons means plain text
  if (!stored.includes(':')) {
    return stored;
  }

  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('[crypto] Invalid encrypted credential format.');
  }

  const [ivB64, tagB64, dataB64] = parts;
  const key        = getDerivedKey();
  const iv         = Buffer.from(ivB64,  'base64url');
  const tag        = Buffer.from(tagB64, 'base64url');
  const ciphertext = Buffer.from(dataB64,'base64url');

  if (iv.length !== IV_BYTES) {
    throw new Error('[crypto] Bad IV length — credential may be corrupt.');
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error('[crypto] Bad auth-tag length — credential may be corrupt or tampered.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Returns true if the string already looks like an encrypted blob
 * (i.e., was already processed by encryptCredential).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 &&
    /^[A-Za-z0-9\-_]+$/.test(parts[0]) &&
    /^[A-Za-z0-9\-_]+$/.test(parts[1]) &&
    /^[A-Za-z0-9\-_]+$/.test(parts[2]);
}
