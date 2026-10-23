import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

/**
 * Signing a push for a phone (M61, D53): the VAPID header (RFC 8292) that
 * tells a browser's push service the push comes from this Wagbook. The push
 * itself carries nothing (no body, so nothing to encrypt): the phone wakes
 * and asks Wagbook, signed in, what happened. Written with node:crypto
 * alone, so no library is needed. Unit tested (vapid.test.ts).
 */

/** The installation's key pair, as base64url: the public key's 65 bytes (uncompressed point) and the private key's 32. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** Who to contact about this sender: "mailto:..." or an https address. */
  subject: string;
}

const b64url = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString("base64url");

/** The key pair as node keys, or null when the strings are not a P-256 pair. */
export function vapidKeyObjects(keys: Pick<VapidKeys, "publicKey" | "privateKey">): { priv: KeyObject; pub: KeyObject } | null {
  try {
    const point = Buffer.from(keys.publicKey, "base64url");
    const d = Buffer.from(keys.privateKey, "base64url");
    if (point.length !== 65 || point[0] !== 4 || d.length !== 32) return null;
    const jwk = { kty: "EC", crv: "P-256", x: b64url(point.subarray(1, 33)), y: b64url(point.subarray(33)) };
    const priv = createPrivateKey({ key: { ...jwk, d: b64url(d) }, format: "jwk" });
    const pub = createPublicKey({ key: jwk, format: "jwk" });
    // The private key must belong to the public one: what one signs, the other verifies.
    const probe = Buffer.from("wagbook");
    if (!verify("sha256", probe, pub, sign("sha256", probe, priv))) return null;
    return { priv, pub };
  } catch {
    return null;
  }
}

/** Twelve hours: push services accept at most 24. */
const LIFETIME_SECONDS = 12 * 60 * 60;

/**
 * The headers for an empty push to one push address: Authorization with a
 * signed token for that service, how long to keep trying (a day), and that
 * it is urgent. Null when the keys are not usable.
 */
export function vapidHeaders(endpoint: string, keys: VapidKeys, now: Date = new Date()): Record<string, string> | null {
  const pair = vapidKeyObjects(keys);
  if (!pair) return null;
  let audience: string;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return null;
    audience = url.origin;
  } catch {
    return null;
  }
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(now.getTime() / 1000) + LIFETIME_SECONDS, sub: keys.subject })));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: pair.priv, dsaEncoding: "ieee-p1363" });
  return {
    Authorization: `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`,
    TTL: "86400",
    Urgency: "high",
    "Content-Length": "0",
  };
}
