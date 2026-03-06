import { z } from "zod";
import { getSalesReport } from "../api/sales-reports.js";

const MAX_ROWS = 500;

// Map Apple's TSV column names to agent-friendly keys
const COLUMN_MAP: Record<string, string> = {
  "Provider": "provider",
  "Provider Country": "providerCountry",
  "SKU": "sku",
  "Developer": "developer",
  "Title": "title",
  "Version": "version",
  "Product Type Identifier": "productType",
  "Units": "units",
  "Developer Proceeds": "developerProceeds",
  "Begin Date": "beginDate",
  "End Date": "endDate",
  "Customer Currency": "customerCurrency",
  "Country Code": "countryCode",
  "Currency of Proceeds": "proceedsCurrency",
  "Apple Identifier": "appleId",
  "Customer Price": "customerPrice",
  "Promo Code": "promoCode",
  "Parent Identifier": "parentId",
  "Subscription": "subscription",
  "Period": "period",
  "Category": "category",
  "CMB": "cmb",
  "Device": "device",
  "Supported Platforms": "supportedPlatforms",
  "Proceeds Reason": "proceedsReason",
  "Preserved Pricing": "preservedPricing",
  "Client": "client",
  "Order Type": "orderType",
};

// Product type codes to human-readable labels
const PRODUCT_TYPES: Record<string, string> = {
  "1": "Free or Paid App (Universal)",
  "1F": "Free or Paid App (iPhone)",
  "1T": "Free or Paid App (iPad)",
  "7": "Update (Universal)",
  "7F": "Update (iPhone)",
  "7T": "Update (iPad)",
  "IA1": "In-App Purchase (Non-Consumable)",
  "IA9": "In-App Purchase (Consumable)",
  "IAY": "In-App Purchase (Auto-Renewable Sub)",
  "IAC": "In-App Purchase (Non-Renewing Sub)",
  "FI1": "Free In-App Purchase",
};

function mapRow(row: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const mappedKey = COLUMN_MAP[key] || key;
    mapped[mappedKey] = value;
  }
  // Add human-readable product type
  if (mapped.productType && PRODUCT_TYPES[mapped.productType]) {
    mapped.productTypeLabel = PRODUCT_TYPES[mapped.productType];
  }
  return mapped;
}

export const getSalesReportSchema = z.object({
  vendorNumber: z
    .string()
    .optional()
    .describe("Vendor number from App Store Connect. If omitted, uses the ASC_VENDOR_NUMBER environment variable."),
  reportType: z
    .enum(["SALES", "INSTALLS", "SUBSCRIPTION", "SUBSCRIPTION_EVENT", "SUBSCRIBER", "NEWSSTAND", "PRE_ORDER"])
    .describe("Type of report"),
  reportSubType: z
    .enum(["SUMMARY", "DETAILED", "SUMMARY_INSTALL_TYPE", "SUMMARY_TERRITORY", "SUMMARY_CHANNEL"])
    .describe("Report sub-type"),
  frequency: z
    .enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"])
    .describe("Report frequency"),
  reportDate: z
    .string()
    .optional()
    .describe("Report date (YYYY-MM-DD). Defaults to most recent available."),
});

export type GetSalesReportInput = z.infer<typeof getSalesReportSchema>;

export async function handleGetSalesReport(input: GetSalesReportInput) {
  const vendorNumber = input.vendorNumber || process.env.ASC_VENDOR_NUMBER;
  if (!vendorNumber) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "No vendor number provided and ASC_VENDOR_NUMBER environment variable is not set. Find your vendor number in App Store Connect > Payments and Financial Reports.",
          }),
        },
      ],
      isError: true,
    };
  }

  const rows = await getSalesReport({
    vendorNumber,
    reportType: input.reportType,
    reportSubType: input.reportSubType,
    frequency: input.frequency,
    reportDate: input.reportDate,
  });

  const mappedRows = rows.map(mapRow);
  const truncated = mappedRows.length > MAX_ROWS;
  const data = truncated ? mappedRows.slice(0, MAX_ROWS) : mappedRows;

  const summary = rows.length === 0
    ? `No data in ${input.frequency} ${input.reportType}/${input.reportSubType} report${input.reportDate ? ` for ${input.reportDate}` : ""}.`
    : `${input.frequency} ${input.reportType}/${input.reportSubType} report${input.reportDate ? ` for ${input.reportDate}` : ""}: ${rows.length} row${rows.length > 1 ? "s" : ""}${truncated ? ` (showing first ${MAX_ROWS})` : ""}.`;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ summary, totalRows: rows.length, truncated, data }),
      },
    ],
  };
}
