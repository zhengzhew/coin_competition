export interface UuidCryptoSource {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
}

/**
 * Create a UUID in both secure contexts and plain-HTTP classroom deployments.
 * crypto.randomUUID() is unavailable on non-localhost HTTP origins, while
 * crypto.getRandomValues() remains available there in modern browsers.
 */
export function createUuid(cryptoApi: UuidCryptoSource | undefined = globalThis.crypto): string {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
