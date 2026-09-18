/**
 * @file password.ts
 * @description PBKDF2-SHA256 password hashing via WebCrypto.
 *
 * Workers has no native bcrypt/argon2, so PBKDF2 is the portable choice. The
 * iteration count is stored per user, so it can be raised later without
 * invalidating existing hashes (rehash on next successful login).
 */

export interface PasswordHash {
  hash: string;
  salt: string;
  iterations: number;
}

/**
 * Tuned to stay well inside the Workers CPU budget for a single login while
 * remaining expensive enough to make offline cracking costly.
 */
export const PBKDF2_ITERATIONS = 150_000;

const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return {
    hash: bytesToBase64(hash),
    salt: bytesToBase64(salt),
    iterations,
  };
}

/** Constant-time comparison, so a wrong password cannot be timed. */
export async function verifyPassword(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  const expected = base64ToBytes(stored.hash);
  const actual = await derive(password, base64ToBytes(stored.salt), stored.iterations);
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= expected[i] ^ actual[i];
  return difference === 0;
}
