import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
export const APPLE_COOKIE_NAME = "apex_apple_cal_auth";

/**
 * Derives a consistent 32-byte (256-bit) encryption key from AUTH_SECRET.
 */
function getDerivedKey(): Buffer {
  const secret = process.env.AUTH_SECRET || "apex-planner-auth-fallback-secret-key-32";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts plaintext string using AES-256-GCM.
 * Output format: `ivHex:authTagHex:ciphertextHex`
 */
export function encrypt(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext created by `encrypt()`.
 * Returns null if authentication tag verification fails or data is corrupted.
 */
export function decrypt(ciphertext: string): string | null {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      return null;
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      return null;
    }

    const key = getDerivedKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("AES-256-GCM decryption failed:", error);
    return null;
  }
}

/**
 * Helper to encrypt any JSON serializable object.
 */
export function encryptJson<T>(data: T): string {
  return encrypt(JSON.stringify(data));
}

/**
 * Helper to decrypt and parse a JSON object.
 */
export function decryptJson<T>(ciphertext: string): T | null {
  const decrypted = decrypt(ciphertext);
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

export interface AppleCalendarInfo {
  url: string;
  name: string;
  color?: string;
}

export interface AppleCalDavCredentials {
  type: "caldav";
  email: string;
  password: string;
  calendars?: AppleCalendarInfo[];
  selectedCalendarUrls?: string[];
  lastSyncedAt?: string;
}

export interface AppleIcsCredentials {
  type: "ics";
  url: string;
  name?: string;
  color?: string;
  lastSyncedAt?: string;
}

export type AppleCredentials = AppleCalDavCredentials | AppleIcsCredentials;

/**
 * HTTP cookie configuration for storing encrypted Apple calendar credentials.
 * Ensures httpOnly, secure in production, sameSite=lax.
 */
export function getAppleCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  };
}
