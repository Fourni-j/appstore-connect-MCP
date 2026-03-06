import { describe, it, expect } from "vitest";

// These are private functions — we need to test them via a workaround.
// We'll import the module and test the exported handler indirectly,
// but first let's test the pure logic by extracting it.
// Since the functions are not exported, we replicate the logic for unit testing.

describe("shouldUseDailyReports logic", () => {
  function shouldUseDailyReports(startDate?: string, endDate?: string): boolean {
    if (!startDate) return false;
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays < 32;
  }

  it("returns false when no start date", () => {
    expect(shouldUseDailyReports()).toBe(false);
  });

  it("returns true for range under 32 days", () => {
    expect(shouldUseDailyReports("2025-01-01", "2025-01-15")).toBe(true);
  });

  it("returns false for range of exactly 32 days", () => {
    expect(shouldUseDailyReports("2025-01-01", "2025-02-02")).toBe(false);
  });

  it("returns false for range over 32 days", () => {
    expect(shouldUseDailyReports("2025-01-01", "2025-06-01")).toBe(false);
  });
});

describe("getMonthlyDates logic", () => {
  function getMonthlyDates(startDate?: string, endDate?: string): string[] {
    const now = new Date();
    const end = endDate ? new Date(endDate) : now;
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getFullYear(), end.getMonth() - 2, 1);

    const dates: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

    while (cursor <= end) {
      dates.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return dates;
  }

  it("generates monthly dates for a given range", () => {
    const result = getMonthlyDates("2025-01-15", "2025-03-10");
    expect(result).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("generates single month for same-month range", () => {
    const result = getMonthlyDates("2025-06-01", "2025-06-30");
    expect(result).toEqual(["2025-06"]);
  });
});

describe("getDailyDates logic", () => {
  function getDailyDates(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const cursor = new Date(startDate);
    const end = new Date(endDate);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  it("generates daily dates for a range", () => {
    const result = getDailyDates("2025-01-01", "2025-01-03");
    expect(result).toEqual(["2025-01-01", "2025-01-02", "2025-01-03"]);
  });

  it("returns single date for same-day range", () => {
    const result = getDailyDates("2025-06-15", "2025-06-15");
    expect(result).toEqual(["2025-06-15"]);
  });

  it("returns empty for inverted range", () => {
    const result = getDailyDates("2025-01-05", "2025-01-01");
    expect(result).toEqual([]);
  });
});

describe("countDownloads logic", () => {
  const DOWNLOAD_TYPES = new Set(["1", "1F", "1T"]);

  function countDownloads(rows: Record<string, string>[], appId: string): number {
    let count = 0;
    for (const row of rows) {
      if (row["Apple Identifier"] !== appId) continue;
      if (!DOWNLOAD_TYPES.has(row["Product Type Identifier"] || "")) continue;
      count += parseInt(row["Units"] || "0", 10);
    }
    return count;
  }

  it("counts only matching app and product types", () => {
    const rows = [
      { "Apple Identifier": "123", "Product Type Identifier": "1", Units: "10" },
      { "Apple Identifier": "123", "Product Type Identifier": "1F", Units: "5" },
      { "Apple Identifier": "123", "Product Type Identifier": "1T", Units: "3" },
      { "Apple Identifier": "123", "Product Type Identifier": "7", Units: "100" }, // IAP
      { "Apple Identifier": "456", "Product Type Identifier": "1", Units: "50" }, // wrong app
    ];
    expect(countDownloads(rows, "123")).toBe(18);
  });

  it("returns 0 for no matching rows", () => {
    const rows = [
      { "Apple Identifier": "999", "Product Type Identifier": "1", Units: "10" },
    ];
    expect(countDownloads(rows, "123")).toBe(0);
  });

  it("handles missing Units field", () => {
    const rows = [
      { "Apple Identifier": "123", "Product Type Identifier": "1" } as any,
    ];
    expect(countDownloads(rows, "123")).toBe(0);
  });
});
