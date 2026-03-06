import { describe, it, expect, vi, beforeEach } from "vitest";
import { gzipSync } from "node:zlib";

// Mock the client module before importing sales-reports
vi.mock("../api/client.js", () => ({
  apiRequest: vi.fn(),
}));

// Mock auth so client doesn't fail
vi.mock("../auth.js", () => ({
  getToken: vi.fn(() => "mock-token"),
}));

import { getSalesReport } from "../api/sales-reports.js";
import { apiRequest } from "../api/client.js";

const mockApiRequest = vi.mocked(apiRequest);

describe("getSalesReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes correct params and accept header to apiRequest", async () => {
    const tsvContent = "Header1\tHeader2\nVal1\tVal2";
    const gzipped = gzipSync(Buffer.from(tsvContent));
    const mockResponse = {
      arrayBuffer: () => Promise.resolve(gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength)),
    };
    mockApiRequest.mockResolvedValue(mockResponse);

    await getSalesReport({
      vendorNumber: "123",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
      reportDate: "2025-01-01",
    });

    expect(mockApiRequest).toHaveBeenCalledWith("/v1/salesReports", {
      params: {
        "filter[vendorNumber]": "123",
        "filter[reportType]": "SALES",
        "filter[reportSubType]": "SUMMARY",
        "filter[frequency]": "DAILY",
        "filter[reportDate]": "2025-01-01",
      },
      rawResponse: true,
      accept: "application/a-gzip",
    });
  });

  it("decompresses gzip and parses TSV", async () => {
    const tsvContent = "Name\tAge\nAlice\t30\nBob\t25";
    const gzipped = gzipSync(Buffer.from(tsvContent));
    const mockResponse = {
      arrayBuffer: () => Promise.resolve(gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength)),
    };
    mockApiRequest.mockResolvedValue(mockResponse);

    const result = await getSalesReport({
      vendorNumber: "123",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
    });

    expect(result).toEqual([
      { Name: "Alice", Age: "30" },
      { Name: "Bob", Age: "25" },
    ]);
  });

  it("falls back to plain text when not gzipped", async () => {
    const tsvContent = "Name\tAge\nAlice\t30";
    const buf = Buffer.from(tsvContent);
    const mockResponse = {
      arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    };
    mockApiRequest.mockResolvedValue(mockResponse);

    const result = await getSalesReport({
      vendorNumber: "123",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
    });

    expect(result).toEqual([{ Name: "Alice", Age: "30" }]);
  });
});
