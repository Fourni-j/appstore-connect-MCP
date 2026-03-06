import jwt from "jsonwebtoken";
import { readFileSync } from "node:fs";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

const TOKEN_LIFETIME_SEC = 20 * 60; // 20 minutes
const CACHE_MARGIN_SEC = 5 * 60; // refresh 5 min early → effective 15 min cache

export function getToken(): string {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && now < tokenExpiresAt - CACHE_MARGIN_SEC) {
    return cachedToken;
  }

  const keyId = process.env.ASC_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID;
  const privateKeyPath = process.env.ASC_PRIVATE_KEY_PATH;

  if (!keyId || !issuerId || !privateKeyPath) {
    throw new Error(
      "Missing required env vars: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH"
    );
  }

  const privateKey = readFileSync(privateKeyPath, "utf8");

  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + TOKEN_LIFETIME_SEC,
    aud: "appstoreconnect-v1",
  };

  cachedToken = jwt.sign(payload, privateKey, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: keyId, typ: "JWT" },
  });

  tokenExpiresAt = now + TOKEN_LIFETIME_SEC;
  return cachedToken;
}
