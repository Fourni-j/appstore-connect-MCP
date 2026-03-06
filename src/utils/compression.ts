import { gunzipSync } from "node:zlib";

/**
 * Decompress a gzipped buffer and return the UTF-8 string content.
 */
export function gunzipToString(buffer: Buffer): string {
  return gunzipSync(buffer).toString("utf8");
}
