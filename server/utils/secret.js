const ENCRYPTED_PREFIX = 'enc:v1:';

function b64urlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveAesKey(secret) {
  const seed = new TextEncoder().encode(`sport-web:alist-password:${secret}`);
  const hash = await crypto.subtle.digest('SHA-256', seed);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function isEncryptedSecret(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

export async function encryptSecret(value, secret) {
  if (value === null || value === undefined || value === '') return null;
  if (!secret) throw new Error('SESSION_SECRET is required to encrypt secrets');
  const text = String(value);
  if (isEncryptedSecret(text)) return text;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  );
  return `${ENCRYPTED_PREFIX}${b64urlEncode(iv)}.${b64urlEncode(ciphertext)}`;
}

export async function decryptSecret(value, secret) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  if (!isEncryptedSecret(text)) return text;
  if (!secret) throw new Error('SESSION_SECRET is required to decrypt secrets');

  const body = text.slice(ENCRYPTED_PREFIX.length);
  const [ivPart, ciphertextPart] = body.split('.');
  if (!ivPart || !ciphertextPart) throw new Error('Invalid encrypted secret format');

  const key = await deriveAesKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64urlDecode(ivPart) },
    key,
    b64urlDecode(ciphertextPart)
  );
  return new TextDecoder().decode(plaintext);
}

export { ENCRYPTED_PREFIX };
