// Makes what an installation needs for alerts on staff phones (M61, D53):
// a VAPID key pair for signing pushes, and the push secret the app and the
// database share. Prints the lines for .env.local and the one line to run in
// the SQL editor. Nothing is sent anywhere. See docs/10-setup-and-deploy.md,
// "Alerts on phones".
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);
const secret = randomBytes(32).toString("hex");

console.log("# Add these to .env.local (or the server's environment):");
console.log(`VAPID_PUBLIC_KEY=${point.toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${priv.d}`);
console.log("VAPID_SUBJECT=mailto:you@example.com");
console.log(`PUSH_SECRET=${secret}`);
console.log("");
console.log("-- Then run this once in the Supabase SQL editor:");
console.log(`select public.set_push_secret('${secret}');`);
