import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db, dbEnabled } from "./db";

// Real email + password auth backed by MongoDB Atlas.
// Passwords are stored only as salted scrypt hashes; sessions are HMAC-signed, httpOnly cookies.

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const COOKIE = "dd_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const authEnabled = () => dbEnabled();

function secret() {
  // Prefer an explicit AUTH_SECRET; otherwise derive one from the DB URI so a deploy works without extra setup.
  const s = process.env.AUTH_SECRET || createHash("sha256").update(`dinodocket:${process.env.MONGODB_URI ?? ""}`).digest("hex");
  return s;
}

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const got = await scrypt(pw, Buffer.from(saltHex, "hex"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sig = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function signSession(u: SessionUser) {
  const body = b64(JSON.stringify({ ...u, exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  return `${body}.${sig(body)}`;
}

export function verifySession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sig(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof p.exp !== "number" || p.exp < Date.now() / 1000) return null;
    return { uid: String(p.uid), email: String(p.email), name: String(p.name) };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  if (!authEnabled()) return null;
  return verifySession((await cookies()).get(COOKIE)?.value);
}

export async function setSession(u: SessionUser) {
  (await cookies()).set(COOKIE, signSession(u), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export type UserDoc = { _id: string; email: string; name: string; pass: string; createdAt: Date; answers?: unknown };

let indexed = false;
export async function users() {
  const col = (await db()).collection<UserDoc>("users");
  if (!indexed) {
    await col.createIndex({ email: 1 }, { unique: true });
    indexed = true;
  }
  return col;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
