import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { vapidHeaders, vapidKeyObjects, type VapidKeys } from "./vapid";

function keys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, "base64url"), Buffer.from(pub.y!, "base64url")]);
  return { publicKey: point.toString("base64url"), privateKey: priv.d!, subject: "mailto:owner@example.test" };
}

describe("vapidHeaders", () => {
  const k = keys();
  const now = new Date("2026-10-23T10:00:00Z");

  it("signs a token for the push service's origin that the public key verifies", () => {
    const h = vapidHeaders("https://fcm.googleapis.com/fcm/send/abc:def", k, now)!;
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h.Authorization);
    expect(match).not.toBeNull();
    const [, header, claims, signature, key] = match!;
    expect(key).toBe(k.publicKey);
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: Math.floor(now.getTime() / 1000) + 12 * 3600,
      sub: "mailto:owner@example.test",
    });
    const sig = Buffer.from(signature, "base64url");
    expect(sig).toHaveLength(64);
    const { pub } = vapidKeyObjects(k)!;
    expect(verify("sha256", Buffer.from(`${header}.${claims}`), { key: pub, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
    expect([h.TTL, h.Urgency, h["Content-Length"]]).toEqual(["86400", "high", "0"]);
  });

  it("refuses keys that are not a pair, and push addresses that are not https", () => {
    const other = keys();
    expect(vapidHeaders("https://push.example.test/x", { ...k, privateKey: other.privateKey }, now)).toBeNull();
    expect(vapidHeaders("https://push.example.test/x", { ...k, publicKey: "short" }, now)).toBeNull();
    expect(vapidHeaders("http://push.example.test/x", k, now)).toBeNull();
    expect(vapidHeaders("not a url", k, now)).toBeNull();
  });
});
