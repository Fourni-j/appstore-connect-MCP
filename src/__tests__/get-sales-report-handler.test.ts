import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api/sales-reports.js", () => ({
  getSalesReport: vi.fn(),
}));

import { handleGetSalesReport } from "../tools/get-sales-report.js";
import { getSalesReport } from "../api/sales-reports.js";

const mockGetSalesReport = getSalesReport as ReturnType<typeof vi.fn>;

describe("handleGetSalesReport", () => {
  const savedEnv = process.env.ASC_VENDOR_NUMBER;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ASC_VENDOR_NUMBER;
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.ASC_VENDOR_NUMBER = savedEnv;
    } else {
      delete process.env.ASC_VENDOR_NUMBER;
    }
  });

  it("maps Apple column names to readable keys", async () => {
    mockGetSalesReport.mockResolvedValue([
      {
        "Provider": "APPLE",
        "Provider Country": "US",
        "SKU": "com.example.app",
        "Title": "My App",
        "Units": "10",
        "Product Type Identifier": "1",
        "Developer Proceeds": "6.99",
        "Begin Date": "01/01/2025",
        "End Date": "01/01/2025",
        "Customer Currency": "USD",
        "Country Code": "US",
        "Currency of Proceeds": "USD",
        "Apple Identifier": "123456",
        "Customer Price": "9.99",
      },
    ]);

    const result = await handleGetSalesReport({
      vendorNumber: "V123",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
    });

    const parsed = JSON.parse(result.content[0].text);
    const row = parsed.data[0];

    expect(row.provider).toBe("APPLE");
    expect(row.providerCountry).toBe("US");
    expect(row.sku).toBe("com.example.app");
    expect(row.title).toBe("My App");
    expect(row.units).toBe("10");
    expect(row.productType).toBe("1");
    expect(row.developerProceeds).toBe("6.99");
    expect(row.customerCurrency).toBe("USD");
    expect(row.countryCode).toBe("US");
    expect(row.appleId).toBe("123456");
  });

  it("adds productTypeLabel for known product types", async () => {
    mockGetSalesReport.mockResolvedValue([
      { "Product Type Identifier": "1", "Units": "5" },
      { "Product Type Identifier": "1F", "Units": "3" },
      { "Product Type Identifier": "IAY", "Units": "2" },
      { "Product Type Identifier": "FI1", "Units": "1" },
    ]);

    const result = await handleGetSalesReport({
      vendorNumber: "V123",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data[0].productTypeLabel).toBe("Free or Paid App (Universal)");
    expect(parsed.data[1].productTypeLabel).toBe("Free or Paid App (iPhone)");
    expect(parsed.data[2].productTypeLabel).toBe("In-App Purchase (Auto-Renewable Sub)");
    expect(parsed.data[3].productTypeLabel).toBe("Free In-App Purchase");
  });

  it("does not add productTypeLabel for unknown product types", async () => {
    mockGetSalesReport.mockResolvedValue([
      { "Product Type Identifier": "UNKNOWN_TYPE", "Units": "1" },
    ]);

    const result = await handleGetSalesReport({
      vendorNumber: "V123",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data[0].productTypeLabel).toBeUndefined();
    expect(parsed.data[0].productType).toBe("UNKNOWN_TYPE");
  });

  it("truncates at 500 rows", async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({
      "Title": `App ${i}`,
      "Units": "1",
    }));
    mockGetSalesReport.mockResolvedValue(rows);

    const result = await handleGetSalesReport({
      vendorNumber: "V123",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalRows).toBe(600);
    expect(parsed.truncated).toBe(true);
    expect(parsed.data).toHaveLength(500);
    expect(parsed.summary).toContain("showing first 500");
  });

  it("does not truncate when rows are under 500", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      "Title": `App ${i}`,
      "Units": "1",
    }));
    mockGetSalesReport.mockResolvedValue(rows);

    const result = await handleGetSalesReport({
      vendorNumber: "V123",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalRows).toBe(10);
    expect(parsed.truncated).toBe(false);
    expect(parsed.data).toHaveLength(10);
  });

  it("falls back to ASC_VENDOR_NUMBER env var", async () => {
    process.env.ASC_VENDOR_NUMBER = "ENV_VENDOR";
    mockGetSalesReport.mockResolvedValue([]);

    await handleGetSalesReport({
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
    });

    expect(mockGetSalesReport).toHaveBeenCalledWith(
      expect.objectContaining({ vendorNumber: "ENV_VENDOR" }),
    );
  });

  it("prefers explicit vendorNumber over env var", async () => {
    process.env.ASC_VENDOR_NUMBER = "ENV_VENDOR";
    mockGetSalesReport.mockResolvedValue([]);

    await handleGetSalesReport({
      vendorNumber: "EXPLICIT_VENDOR",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
    });

    expect(mockGetSalesReport).toHaveBeenCalledWith(
      expect.objectContaining({ vendorNumber: "EXPLICIT_VENDOR" }),
    );
  });

  it("returns isError when no vendor number is available", async () => {
    delete process.env.ASC_VENDOR_NUMBER;

    const result = await handleGetSalesReport({
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("No vendor number");
    expect(mockGetSalesReport).not.toHaveBeenCalled();
  });

  it("returns correct summary for empty report", async () => {
    mockGetSalesReport.mockResolvedValue([]);

    const result = await handleGetSalesReport({
      vendorNumber: "V123",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
      reportDate: "2025-01-01",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary).toContain("No data");
    expect(parsed.summary).toContain("DAILY");
    expect(parsed.summary).toContain("SALES/SUMMARY");
    expect(parsed.summary).toContain("2025-01-01");
    expect(parsed.data).toEqual([]);
  });

  it("includes report date in summary when provided", async () => {
    mockGetSalesReport.mockResolvedValue([
      { "Title": "App", "Units": "1" },
    ]);

    const result = await handleGetSalesReport({
      vendorNumber: "V123",
      reportType: "SALES",
      reportSubType: "SUMMARY",
      frequency: "DAILY",
      reportDate: "2025-03-15",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary).toContain("for 2025-03-15");
    expect(parsed.summary).toContain("1 row");
  });

  it("passes all parameters to getSalesReport API", async () => {
    mockGetSalesReport.mockResolvedValue([]);

    await handleGetSalesReport({
      vendorNumber: "V123",
      reportType: "INSTALLS",
      reportSubType: "DETAILED",
      frequency: "WEEKLY",
      reportDate: "2025-06-01",
    });

    expect(mockGetSalesReport).toHaveBeenCalledWith({
      vendorNumber: "V123",
      reportType: "INSTALLS",
      reportSubType: "DETAILED",
      frequency: "WEEKLY",
      reportDate: "2025-06-01",
    });
  });
});
