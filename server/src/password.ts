import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 32;

/** Hash a board password for storage, as "scrypt$<salt>$<key>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, KEY_BYTES);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** True if the password matches a stored hash. A malformed hash never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  if (expected.length !== KEY_BYTES) return false;
  const actual = await derive(password, Buffer.from(saltHex, "hex"), KEY_BYTES);
  return timingSafeEqual(actual, expected);
}
