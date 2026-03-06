import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api/sales-reports.js", () => ({
  getSalesReport: vi.fn(),
}));

import { handleGetDownloadsSummary } from "../tools/get-downloads-summary.js";
import { getSalesReport } from "../api/sales-reports.js";

const mockGetSalesReport = getSalesReport as ReturnType<typeof vi.fn>;

describe("handleGetDownloadsSummary", () => {
  const savedEnv = process.env.ASC_VENDOR_NUMBER;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASC_VENDOR_NUMBER = "TEST_VENDOR";
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.ASC_VENDOR_NUMBER = savedEnv;
    } else {
      delete process.env.ASC_VENDOR_NUMBER;
    }
  });

  it("returns isError when ASC_VENDOR_NUMBER is not set", async () => {
    delete process.env.ASC_VENDOR_NUMBER;

    const result = await handleGetDownloadsSummary({ appId: "123" });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("ASC_VENDOR_NUMBER");
    expect(mockGetSalesReport).not.toHaveBeenCalled();
  });

  it("returns summary field with download count and frequency for monthly", async () => {
    // No startDate => monthly mode, default 3 months
    mockGetSalesReport.mockResolvedValue([
      { "Apple Identifier": "123", "Product Type Identifier": "1", "Units": "50" },
      { "Apple Identifier": "123", "Product Type Identifier": "1F", "Units": "20" },
    ]);

    const result = await handleGetDownloadsSummary({ appId: "123" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary).toBeDefined();
    expect(parsed.summary).toContain("first-time downloads");
    expect(parsed.summary).toContain("monthly");
    expect(parsed.appId).toBe("123");
    expect(parsed.totalDownloads).toBeGreaterThanOrEqual(0);
    expect(parsed.frequency).toBe("MONTHLY");
    expect(parsed.byPeriod).toBeDefined();
  });

  it("uses daily mode for short date ranges (< 32 days)", async () => {
    mockGetSalesReport.mockResolvedValue([
      { "Apple Identifier": "123", "Product Type Identifier": "1", "Units": "10" },
    ]);

    const result = await handleGetDownloadsSummary({
      appId: "123",
      startDate: "2025-01-01",
      endDate: "2025-01-05",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.frequency).toBe("DAILY");
    expect(parsed.summary).toContain("daily");
  });

  it("aggregates downloads across multiple periods", async () => {
    let callCount = 0;
    mockGetSalesReport.mockImplementation(async () => {
      callCount++;
      return [
        { "Apple Identifier": "123", "Product Type Identifier": "1", "Units": "10" },
      ];
    });

    const result = await handleGetDownloadsSummary({
      appId: "123",
      startDate: "2025-01-01",
      endDate: "2025-01-03",
    });

    const parsed = JSON.parse(result.content[0].text);
    // 3 days of daily reports, each with 10 downloads
    expect(parsed.totalDownloads).toBe(30);
    expect(Object.keys(parsed.byPeriod)).toHaveLength(3);
  });

  it("skips 404 errors silently for daily reports", async () => {
    let callNum = 0;
    mockGetSalesReport.mockImplementation(async () => {
      callNum++;
      if (callNum === 2) {
        throw new Error("Request failed with status 404");
      }
      return [
        { "Apple Identifier": "123", "Product Type Identifier": "1", "Units": "5" },
      ];
    });

    const result = await handleGetDownloadsSummary({
      appId: "123",
      startDate: "2025-01-01",
      endDate: "2025-01-03",
    });

    const parsed = JSON.parse(result.content[0].text);
    // Day 2 is a 404, so only days 1 and 3 counted
    expect(parsed.totalDownloads).toBe(10);
    expect(parsed.warnings).toBeUndefined();
  });

  it("includes warnings for non-404 errors", async () => {
    let callNum = 0;
    mockGetSalesReport.mockImplementation(async () => {
      callNum++;
      if (callNum === 2) {
        throw new Error("Server error 500");
      }
      return [
        { "Apple Identifier": "123", "Product Type Identifier": "1", "Units": "5" },
      ];
    });

    const result = await handleGetDownloadsSummary({
      appId: "123",
      startDate: "2025-01-01",
      endDate: "2025-01-03",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.warnings).toBeDefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.warnings[0]).toContain("Server error 500");
  });

  it("only counts download product types (1, 1F, 1T)", async () => {
    mockGetSalesReport.mockResolvedValue([
      { "Apple Identifier": "123", "Product Type Identifier": "1", "Units": "10" },
      { "Apple Identifier": "123", "Product Type Identifier": "7", "Units": "100" },  // Update
      { "Apple Identifier": "123", "Product Type Identifier": "IAY", "Units": "50" }, // IAP
      { "Apple Identifier": "456", "Product Type Identifier": "1", "Units": "30" },   // Wrong app
    ]);

    const result = await handleGetDownloadsSummary({
      appId: "123",
      startDate: "2025-01-01",
      endDate: "2025-01-01",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalDownloads).toBe(10);
  });

  it("includes date range in summary", async () => {
    mockGetSalesReport.mockResolvedValue([
      { "Apple Identifier": "123", "Product Type Identifier": "1", "Units": "5" },
    ]);

    const result = await handleGetDownloadsSummary({
      appId: "123",
      startDate: "2025-01-01",
      endDate: "2025-01-03",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary).toContain("from");
    expect(parsed.summary).toContain("to");
  });
});
