import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock auth
vi.mock("../auth.js", () => ({
  getToken: vi.fn(() => "mock-token"),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { apiRequest, ApiError } from "../api/client.js";

describe("apiRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns JSON response by default", async () => {
    const data = { id: "123", name: "Test App" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    });

    const result = await apiRequest("/v1/apps");
    expect(result).toEqual(data);
  });

  it("returns raw response when rawResponse is true", async () => {
    const mockResponse = { ok: true, status: 200, body: "raw" };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await apiRequest("/v1/apps", { rawResponse: true });
    expect(result).toBe(mockResponse);
  });

  it("throws ApiError on non-retryable errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });

    await expect(apiRequest("/v1/apps")).rejects.toThrow(ApiError);
  });

  it("retries on 429 with backoff", async () => {
    // First call: 429, Second call: success
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      });

    const promise = apiRequest("/v1/apps");

    // Advance past the first backoff (1000ms)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx errors", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ recovered: true }),
      });

    const promise = apiRequest("/v1/apps");
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ recovered: true });
  });

  it("uses custom accept header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await apiRequest("/v1/salesReports", { accept: "application/a-gzip" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/a-gzip",
        }),
      })
    );
  });

  it("throws after max retries", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const promise = apiRequest("/v1/apps");
    // Attach rejection handler immediately to avoid unhandled rejection
    const assertion = expect(promise).rejects.toThrow("failed after 3 retries");

    await vi.runAllTimersAsync();
    await assertion;
  }, 10000);
});
