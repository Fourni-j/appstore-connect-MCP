import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { gunzipToString } from "../utils/compression.js";

describe("gunzipToString", () => {
  it("decompresses a valid gzip buffer", () => {
    const original = "Hello, world!";
    const compressed = gzipSync(Buffer.from(original));
    expect(gunzipToString(compressed)).toBe(original);
  });

  it("handles multi-line content", () => {
    const original = "line1\nline2\nline3";
    const compressed = gzipSync(Buffer.from(original));
    expect(gunzipToString(compressed)).toBe(original);
  });

  it("throws on invalid buffer", () => {
    const invalid = Buffer.from("not gzipped data");
    expect(() => gunzipToString(invalid)).toThrow();
  });
});
