import { getToken } from "../auth.js";

const BASE_URL = "https://api.appstoreconnect.apple.com";
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`App Store Connect API error ${status}: ${body}`);
    this.name = "ApiError";
  }
}

export async function apiRequest(
  path: string,
  options: {
    params?: Record<string, string>;
    rawResponse?: boolean;
    accept?: string;
  } = {}
): Promise<any> {
  const url = new URL(path, BASE_URL);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const token = getToken();
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: options.accept ?? "application/json",
      },
    });

    if (response.status === 429 || response.status >= 500) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new ApiError(response.status, body);
    }

    if (options.rawResponse) {
      return response;
    }

    return response.json();
  }

  throw new Error(`Request to ${path} failed after ${MAX_RETRIES} retries`);
}

/**
 * Fetch a URL directly (for downloading report segments that return full URLs).
 * Does NOT send Authorization header — pre-signed S3 URLs include their own auth
 * and adding a Bearer token causes AWS to reject the request.
 */
export async function fetchUrl(url: string): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url);

    if (response.status === 429 || response.status >= 500) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new ApiError(response.status, body);
    }

    return response;
  }

  throw new Error(`Request to ${url} failed after ${MAX_RETRIES} retries`);
}
