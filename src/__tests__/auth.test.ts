import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("getToken", () => {
  let tmpDir: string;
  let keyPath: string;
  let publicKey: string;

  beforeEach(() => {
    // Generate a fresh ES256 key pair for testing
    const { publicKey: pubKey, privateKey: privKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });

    tmpDir = mkdtempSync(join(tmpdir(), "asc-test-"));
    keyPath = join(tmpDir, "AuthKey.p8");
    writeFileSync(keyPath, privKey.export({ type: "pkcs8", format: "pem" }));
    publicKey = pubKey.export({ type: "spki", format: "pem" }) as string;

    process.env.ASC_KEY_ID = "TESTKEY123";
    process.env.ASC_ISSUER_ID = "test-issuer-id";
    process.env.ASC_PRIVATE_KEY_PATH = keyPath;

    // Reset module cache to clear cached token
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.ASC_KEY_ID;
    delete process.env.ASC_ISSUER_ID;
    delete process.env.ASC_PRIVATE_KEY_PATH;
    vi.useRealTimers();
  });

  it("generates a valid JWT", async () => {
    const { getToken } = await import("../auth.js");
    const token = getToken();

    const decoded = jwt.verify(token, publicKey, { algorithms: ["ES256"] }) as jwt.JwtPayload;
    expect(decoded.iss).toBe("test-issuer-id");
    expect(decoded.aud).toBe("appstoreconnect-v1");
    expect(decoded.exp).toBeDefined();
  });

  it("caches token within expiry window", async () => {
    const { getToken } = await import("../auth.js");
    const token1 = getToken();
    const token2 = getToken();
    expect(token1).toBe(token2);
  });

  it("refreshes token after expiry", async () => {
    vi.useFakeTimers();

    const { getToken } = await import("../auth.js");
    const token1 = getToken();

    // Advance past the cache window (20 min lifetime - 5 min margin = 15 min effective)
    vi.advanceTimersByTime(16 * 60 * 1000);

    const token2 = getToken();
    expect(token2).not.toBe(token1);
  });

  it("throws when env vars are missing", async () => {
    delete process.env.ASC_KEY_ID;
    const { getToken } = await import("../auth.js");
    expect(() => getToken()).toThrow("Missing required env vars");
  });
});
