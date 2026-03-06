import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/analytics.js", () => ({
  getAnalyticsReport: vi.fn(),
}));

import { handleGetAnalyticsReport } from "../tools/get-analytics-report.js";
import { getAnalyticsReport } from "../api/analytics.js";

const mockGetAnalyticsReport = getAnalyticsReport as ReturnType<typeof vi.fn>;

describe("handleGetAnalyticsReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("pending status", () => {
    it("returns pending message when report is not ready", async () => {
      mockGetAnalyticsReport.mockResolvedValue({
        status: "pending",
        message: "Reports are still generating.",
      });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe("pending");
      expect(parsed.message).toBe("Reports are still generating.");
    });
  });

  describe("raw mode", () => {
    it("returns raw rows with truncation at default 500", async () => {
      const rows = Array.from({ length: 600 }, (_, i) => ({
        "Date": "2025-01-01",
        "Event": "Impression",
        "Counts": String(i),
      }));
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
        raw: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe("ready");
      expect(parsed.totalRawRows).toBe(600);
      expect(parsed.truncated).toBe(true);
      expect(parsed.data).toHaveLength(500);
      expect(parsed.summary).toContain("600 rows");
      expect(parsed.summary).toContain("showing first 500");
    });

    it("respects custom limit in raw mode", async () => {
      const rows = Array.from({ length: 100 }, (_, i) => ({
        "Date": "2025-01-01",
        "Event": "Impression",
        "Counts": String(i),
      }));
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
        raw: true,
        limit: 50,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.truncated).toBe(true);
      expect(parsed.data).toHaveLength(50);
      expect(parsed.summary).toContain("showing first 50");
    });

    it("does not truncate when under limit", async () => {
      const rows = [
        { "Date": "2025-01-01", "Event": "Impression", "Counts": "10" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
        raw: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.truncated).toBe(false);
      expect(parsed.data).toHaveLength(1);
    });

    it("includes date range in raw summary", async () => {
      const rows = [
        { "Date": "2025-01-01", "Event": "Impression", "Counts": "10" },
        { "Date": "2025-01-03", "Event": "Impression", "Counts": "20" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
        raw: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain("from 2025-01-01 to 2025-01-03");
    });
  });

  describe("engagement aggregation", () => {
    it("aggregates counts, uniqueCounts, conversionRates, bySource, byDevice", async () => {
      const rows = [
        { "Date": "2025-01-01", "Event": "Impression", "Counts": "100", "Unique Counts": "80", "Source Type": "Search", "Device": "iPhone" },
        { "Date": "2025-01-01", "Event": "Impression", "Counts": "50", "Unique Counts": "40", "Source Type": "Browse", "Device": "iPad" },
        { "Date": "2025-01-01", "Event": "Tap", "Counts": "20", "Unique Counts": "15", "Source Type": "Search", "Device": "iPhone" },
        { "Date": "2025-01-01", "Event": "Page view", "Counts": "10", "Unique Counts": "8", "Source Type": "Search", "Device": "iPhone" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
        granularity: "DAILY",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe("ready");
      expect(parsed.granularity).toBe("daily");

      // Check totals
      expect(parsed.totals["Impression"]).toBe(150);
      expect(parsed.totals["Tap"]).toBe(20);
      expect(parsed.totals["Page view"]).toBe(10);

      expect(parsed.uniqueTotals["Impression"]).toBe(120);
      expect(parsed.uniqueTotals["Tap"]).toBe(15);
      expect(parsed.uniqueTotals["Page view"]).toBe(8);

      // Check conversion rates
      expect(parsed.conversionRates).toBeDefined();
      expect(parsed.conversionRates["tapRate (Unique Taps / Unique Impressions)"]).toBeDefined();
      expect(parsed.conversionRates["pageViewRate (Unique Page Views / Unique Impressions)"]).toBeDefined();

      // Check periods
      expect(parsed.periods).toHaveLength(1);
      const period = parsed.periods[0];
      expect(period.date).toBe("2025-01-01");
      expect(period.counts["Impression"]).toBe(150);
      expect(period.uniqueCounts["Impression"]).toBe(120);
      expect(period.bySource["Search"]).toBe(130); // 100 + 20 + 10
      expect(period.bySource["Browse"]).toBe(50);
      expect(period.byDevice["iPhone"]).toBe(130);
      expect(period.byDevice["iPad"]).toBe(50);
      expect(period.conversionRates).toBeDefined();
    });

    it("enriches engagement with COMMERCE download data", async () => {
      // First call: engagement data, second call: commerce data
      mockGetAnalyticsReport
        .mockResolvedValueOnce({
          status: "ready",
          data: [
            { "Date": "2025-01-01", "Event": "Impression", "Counts": "1000", "Unique Counts": "800", "Source Type": "Search", "Device": "iPhone" },
          ],
        })
        .mockResolvedValueOnce({
          status: "ready",
          data: [
            { "Date": "2025-01-01", "Download Type": "First-time download", "Counts": "50", "Device": "iPhone", "Territory": "US" },
            { "Date": "2025-01-01", "Download Type": "Redownload", "Counts": "10", "Device": "iPhone", "Territory": "US" },
            { "Date": "2025-01-01", "Download Type": "Auto-update", "Counts": "200", "Device": "iPhone", "Territory": "US" },
          ],
        });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
        granularity: "DAILY",
      });

      const parsed = JSON.parse(result.content[0].text);

      // Total downloads
      expect(parsed.downloads).toBeDefined();
      expect(parsed.downloads.totalDownloads).toBe(60); // 50 + 10
      expect(parsed.downloads.firstTimeDownloads).toBe(50);
      expect(parsed.downloads.redownloads).toBe(10);
      expect(parsed.downloads.updates).toBe(200);

      // Per-period downloads
      expect(parsed.periods[0].downloads).toBeDefined();
      expect(parsed.periods[0].downloads.totalDownloads).toBe(60);

      // Conversion rate including downloads
      expect(parsed.conversionRates["conversionRate (Total Downloads / Unique Impressions)"]).toBeDefined();
      expect(parsed.periods[0].conversionRates["conversionRate (Total Downloads / Unique Impressions)"]).toBeDefined();

      // Summary includes download info
      expect(parsed.summary).toContain("Downloads:");
      expect(parsed.summary).toContain("60");
      expect(parsed.summary).toContain("50 first-time");
    });

    it("handles COMMERCE data being unavailable gracefully", async () => {
      mockGetAnalyticsReport
        .mockResolvedValueOnce({
          status: "ready",
          data: [
            { "Date": "2025-01-01", "Event": "Impression", "Counts": "100", "Unique Counts": "80", "Source Type": "Search", "Device": "iPhone" },
          ],
        })
        .mockRejectedValueOnce(new Error("Commerce not available"));

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
        granularity: "DAILY",
      });

      const parsed = JSON.parse(result.content[0].text);
      // Should still work, just without download data
      expect(parsed.status).toBe("ready");
      expect(parsed.downloads).toBeUndefined();
      expect(parsed.periods).toHaveLength(1);
    });
  });

  describe("commerce aggregation", () => {
    it("aggregates commerce by date with counts, byDevice, byTerritory", async () => {
      const rows = [
        { "Date": "2025-01-01", "Download Type": "First-time download", "Counts": "100", "Device": "iPhone", "Territory": "US" },
        { "Date": "2025-01-01", "Download Type": "Redownload", "Counts": "20", "Device": "iPad", "Territory": "GB" },
        { "Date": "2025-01-02", "Download Type": "First-time download", "Counts": "80", "Device": "iPhone", "Territory": "US" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "COMMERCE",
        granularity: "DAILY",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.periods).toHaveLength(2);

      const day1 = parsed.periods[0];
      expect(day1.date).toBe("2025-01-01");
      expect(day1.counts["First-time download"]).toBe(100);
      expect(day1.counts["Redownload"]).toBe(20);
      expect(day1.byDevice["iPhone"]).toBe(100);
      expect(day1.byDevice["iPad"]).toBe(20);
      expect(day1.byTerritory["US"]).toBe(100);
      expect(day1.byTerritory["GB"]).toBe(20);
    });
  });

  describe("granularity detection", () => {
    it("detects daily granularity for consecutive days", async () => {
      const rows = [
        { "Date": "2025-01-01", "Event": "Impression", "Counts": "10", "Unique Counts": "5", "Source Type": "Search", "Device": "iPhone" },
        { "Date": "2025-01-02", "Event": "Impression", "Counts": "20", "Unique Counts": "10", "Source Type": "Search", "Device": "iPhone" },
        { "Date": "2025-01-03", "Event": "Impression", "Counts": "30", "Unique Counts": "15", "Source Type": "Search", "Device": "iPhone" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
      });

      const parsed = JSON.parse(result.content[0].text);
      // No explicit granularity input, should detect "daily"
      expect(parsed.granularity).toBe("daily");
    });

    it("detects monthly granularity for month-spaced periods", async () => {
      const rows = [
        { "Date": "2025-01-01", "Event": "Impression", "Counts": "10", "Unique Counts": "5", "Source Type": "Search", "Device": "iPhone" },
        { "Date": "2025-02-01", "Event": "Impression", "Counts": "20", "Unique Counts": "10", "Source Type": "Search", "Device": "iPhone" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.granularity).toBe("monthly");
    });

    it("detects mixed granularity for irregular gaps", async () => {
      const rows = [
        { "Date": "2025-01-01", "Event": "Impression", "Counts": "10", "Unique Counts": "5", "Source Type": "Search", "Device": "iPhone" },
        { "Date": "2025-01-05", "Event": "Impression", "Counts": "20", "Unique Counts": "10", "Source Type": "Search", "Device": "iPhone" },
        { "Date": "2025-02-01", "Event": "Impression", "Counts": "30", "Unique Counts": "15", "Source Type": "Search", "Device": "iPhone" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.granularity).toContain("mixed");
    });

    it("uses explicit granularity label when provided", async () => {
      const rows = [
        { "Date": "2025-01-01", "Event": "Impression", "Counts": "10", "Unique Counts": "5", "Source Type": "Search", "Device": "iPhone" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
        granularity: "WEEKLY",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.granularity).toBe("weekly");
    });
  });

  describe("APP_USAGE aggregation", () => {
    it("aggregates usage by date with counts and byDevice", async () => {
      const rows = [
        { "Date": "2025-01-01", "Event": "Active devices", "Counts": "500", "Device": "iPhone" },
        { "Date": "2025-01-01", "Event": "Active devices", "Counts": "200", "Device": "iPad" },
        { "Date": "2025-01-01", "Event": "Sessions", "Counts": "1000", "Device": "iPhone" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_USAGE",
        granularity: "DAILY",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.periods).toHaveLength(1);
      const day = parsed.periods[0];
      expect(day.counts["Active devices"]).toBe(700);
      expect(day.counts["Sessions"]).toBe(1000);
      expect(day.byDevice["iPhone"]).toBe(1500);
      expect(day.byDevice["iPad"]).toBe(200);
    });
  });

  describe("generic aggregation (FRAMEWORK_USAGE, PERFORMANCE)", () => {
    it("aggregates generic data by date with counts only", async () => {
      const rows = [
        { "Date": "2025-01-01", "Metric": "Crash count", "Count": "5" },
        { "Date": "2025-01-01", "Metric": "Crash count", "Count": "3" },
        { "Date": "2025-01-02", "Metric": "Crash count", "Count": "2" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "PERFORMANCE",
        granularity: "DAILY",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.periods).toHaveLength(2);
      expect(parsed.periods[0].counts["Crash count"]).toBe(8);
      expect(parsed.periods[1].counts["Crash count"]).toBe(2);
    });
  });

  describe("response structure", () => {
    it("includes dateRange, totals, uniqueTotals, periods in aggregated mode", async () => {
      const rows = [
        { "Date": "2025-01-01", "Event": "Impression", "Counts": "100", "Unique Counts": "80", "Source Type": "Search", "Device": "iPhone" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
        granularity: "DAILY",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBeDefined();
      expect(parsed.status).toBe("ready");
      expect(parsed.dateRange).toEqual({ from: "2025-01-01", to: "2025-01-01" });
      expect(parsed.totals).toBeDefined();
      expect(parsed.uniqueTotals).toBeDefined();
      expect(parsed.periods).toBeDefined();
      expect(parsed.conversionRates).toBeDefined();
    });

    it("summary includes totals list and rates for engagement", async () => {
      const rows = [
        { "Date": "2025-01-01", "Event": "Impression", "Counts": "100", "Unique Counts": "80", "Source Type": "Search", "Device": "iPhone" },
        { "Date": "2025-01-01", "Event": "Tap", "Counts": "20", "Unique Counts": "15", "Source Type": "Search", "Device": "iPhone" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "APP_STORE_ENGAGEMENT",
        granularity: "DAILY",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain("Impression:");
      expect(parsed.summary).toContain("Tap:");
      expect(parsed.summary).toContain("Rates:");
      expect(parsed.summary).toContain("tap");
      expect(parsed.summary).toContain("page view");
    });

    it("does not include conversionRates for non-engagement categories", async () => {
      const rows = [
        { "Date": "2025-01-01", "Download Type": "First-time download", "Counts": "50", "Device": "iPhone", "Territory": "US" },
      ];
      mockGetAnalyticsReport.mockResolvedValue({ status: "ready", data: rows });

      const result = await handleGetAnalyticsReport({
        appId: "123",
        category: "COMMERCE",
        granularity: "DAILY",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.conversionRates).toBeUndefined();
    });
  });
});
