/**
 * Client-side End-to-End Encryption using Web Crypto API
 * Implements X25519 key exchange and AES-256-GCM encryption
 */

// Helper to work around TypeScript's strict Uint8Array typing with Web Crypto API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asBuffer = (arr: Uint8Array): BufferSource => arr as any;

export interface UserIdentityKeys {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  salt: Uint8Array;
}

export interface EncryptedMessage {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  timestamp: Date;
}

/**
 * Generate a new X25519 identity key pair
 */
export async function generateIdentityKeyPair(
  password: string
): Promise<UserIdentityKeys> {
  // Generate X25519 key pair using SubtleCrypto
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "X25519",
    },
    true,
    ["deriveKey", "deriveBits"]
  );

  // Export the keys
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey)
  );
  const privateKey = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
  );

  // Generate salt for password-based encryption
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive KEK from password using PBKDF2
  const kek = await deriveKEKFromPassword(password, salt);

  // Encrypt the private key with the KEK
  const encryptedPrivateKey = await encryptWithAESGCM(privateKey, kek);

  return {
    publicKey,
    privateKey: encryptedPrivateKey,
    salt,
  };
}

/**
 * Derive a Key Encryption Key (KEK) from a password using PBKDF2
 */
export async function deriveKEKFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: asBuffer(salt),
      iterations: 600000, // OWASP recommendation for 2024+
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Decrypt the private key using the KEK
 */
export async function decryptPrivateKey(
  encryptedPrivateKey: Uint8Array,
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const kek = await deriveKEKFromPassword(password, salt);
  const decryptedPrivateKey = await decryptWithAESGCM(encryptedPrivateKey, kek);

  return await crypto.subtle.importKey(
    "pkcs8",
    asBuffer(decryptedPrivateKey),
    {
      name: "ECDH",
      namedCurve: "X25519",
    },
    true,
    ["deriveKey", "deriveBits"]
  );
}

/**
 * Perform ECDH key agreement and derive conversation key using HKDF
 */
export async function deriveConversationKey(
  myPrivateKey: CryptoKey,
  theirPublicKeyBytes: Uint8Array,
  conversationId: string
): Promise<CryptoKey> {
  // Import the other party's public key
  const theirPublicKey = await crypto.subtle.importKey(
    "raw",
    asBuffer(theirPublicKeyBytes),
    {
      name: "ECDH",
      namedCurve: "X25519",
    },
    false,
    []
  );

  // Perform ECDH to get shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: theirPublicKey,
    },
    myPrivateKey,
    256
  );

  // Use HKDF to derive conversation key from shared secret
  const encoder = new TextEncoder();
  const info = encoder.encode(`conversation:${conversationId}`);

  const importedSecret = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: asBuffer(new Uint8Array(0)),
      info: asBuffer(info),
    },
    importedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a message with AES-256-GCM
 */
export async function encryptMessage(
  plaintext: string,
  conversationKey: CryptoKey
): Promise<EncryptedMessage> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const nonce = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM nonce

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: asBuffer(nonce),
      },
      conversationKey,
      asBuffer(plaintextBytes)
    )
  );

  return {
    ciphertext,
    nonce,
    timestamp: new Date(),
  };
}

/**
 * Decrypt a message with AES-256-GCM
 */
export async function decryptMessage(
  encrypted: EncryptedMessage,
  conversationKey: CryptoKey
): Promise<string> {
  const plaintextBytes = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asBuffer(encrypted.nonce),
    },
    conversationKey,
    asBuffer(encrypted.ciphertext)
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintextBytes);
}

/**
 * Helper: Encrypt data with AES-GCM
 */
async function encryptWithAESGCM(
  data: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: asBuffer(nonce),
      },
      key,
      asBuffer(data)
    )
  );

  // Prepend nonce to ciphertext for storage
  const result = new Uint8Array(nonce.length + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, nonce.length);

  return result;
}

/**
 * Helper: Decrypt data with AES-GCM
 */
async function decryptWithAESGCM(
  encryptedData: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  // Extract nonce and ciphertext
  const nonce = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);

  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asBuffer(nonce),
      },
      key,
      asBuffer(ciphertext)
    )
  );
}

/**
 * Convert Uint8Array to Base64 string for storage/transmission
 */
export function uint8ArrayToBase64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array));
}

/**
 * Convert Base64 string back to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/**
 * Store encrypted keys in IndexedDB (for persistence)
 */
export async function storeKeysInIndexedDB(
  userId: string,
  keys: UserIdentityKeys
): Promise<void> {
  const db = await openKeysDB();
  const tx = db.transaction("keys", "readwrite");
  const store = tx.objectStore("keys");

  const request = store.put({
    userId,
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    salt: keys.salt,
  });

  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve encrypted keys from IndexedDB
 */
export async function getKeysFromIndexedDB(
  userId: string
): Promise<UserIdentityKeys | null> {
  const db = await openKeysDB();
  const tx = db.transaction("keys", "readonly");
  const store = tx.objectStore("keys");

  const request = store.get(userId);

  const result = await new Promise<UserIdentityKeys | null>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  return result;
}

/**
 * Open IndexedDB for key storage
 */
async function openKeysDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("SecureChatKeys", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys", { keyPath: "userId" });
      }
    };
  });
}
