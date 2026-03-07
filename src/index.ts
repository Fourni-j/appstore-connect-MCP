#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { listAppsSchema, handleListApps } from "./tools/list-apps.js";
import { getAppMetadataSchema, handleGetAppMetadata } from "./tools/get-app-metadata.js";
import { getAppStoreVersionsSchema, handleGetAppStoreVersions } from "./tools/get-app-store-versions.js";
import { getSalesReportSchema, handleGetSalesReport } from "./tools/get-sales-report.js";
import { getAnalyticsReportSchema, handleGetAnalyticsReport } from "./tools/get-analytics-report.js";
import { getDownloadsSummarySchema, handleGetDownloadsSummary } from "./tools/get-downloads-summary.js";
import { getCustomerReviewsSchema, handleGetCustomerReviews } from "./tools/get-customer-reviews.js";

const server = new McpServer({
  name: "appstore-connect",
  version: "1.0.0",
});

server.tool(
  "list_apps",
  "List all apps in the App Store Connect account. Returns each app's id, name, bundleId, and SKU. Use the returned id as appId in all other tools.",
  listAppsSchema.shape,
  async (input) => handleListApps(listAppsSchema.parse(input))
);

server.tool(
  "get_app_metadata",
  "Get localized metadata for an app: title, subtitle, keywords, description, and promotional text for all locales. Useful for ASO review. Requires appId from list_apps.",
  getAppMetadataSchema.shape,
  async (input) => handleGetAppMetadata(getAppMetadataSchema.parse(input))
);

server.tool(
  "get_sales_report",
  "Download and parse App Store Connect sales/installs reports. Returns structured rows with fields: title, units, customerPrice, developerProceeds, countryCode, device, productType, etc. Vendor number is auto-resolved from ASC_VENDOR_NUMBER env var if not provided.",
  getSalesReportSchema.shape,
  async (input) => handleGetSalesReport(getSalesReportSchema.parse(input))
);

server.tool(
  "get_analytics_report",
  "Get analytics report data for an app. Categories: APP_STORE_ENGAGEMENT (impressions, page views), COMMERCE (purchases, sales), APP_USAGE (sessions, active devices), FRAMEWORK_USAGE, PERFORMANCE (crashes, launch time). Returns aggregated metrics by default (totals + breakdown by source, device). Set raw=true for granular per-territory/device/OS rows. IMPORTANT: always set granularity (DAILY or MONTHLY) — without it, Apple returns a mix of monthly and daily instances which is misleading. MONTHLY only covers completed months; DAILY only covers recent days (Apple rolls up older daily data into monthly). To get a full picture spanning past months and the current month, make two calls: one MONTHLY and one DAILY. Requires appId from list_apps.",
  getAnalyticsReportSchema.shape,
  async (input) => handleGetAnalyticsReport(getAnalyticsReportSchema.parse(input))
);

server.tool(
  "get_app_store_versions",
  "List app versions with their App Store state (READY_FOR_SALE, IN_REVIEW, etc.), creation date, and platform. Useful to correlate releases with metric changes. Requires appId from list_apps.",
  getAppStoreVersionsSchema.shape,
  async (input) => handleGetAppStoreVersions(getAppStoreVersionsSchema.parse(input))
);

server.tool(
  "get_downloads_summary",
  "Get first-time download counts aggregated by period. Automatically uses daily granularity for ranges under 32 days, monthly otherwise. Only counts new installs (excludes updates, re-downloads, IAPs). Requires ASC_VENDOR_NUMBER env var. Requires appId from list_apps.",
  getDownloadsSummarySchema.shape,
  async (input) => handleGetDownloadsSummary(getDownloadsSummarySchema.parse(input))
);

server.tool(
  "get_customer_reviews",
  "Get customer reviews and ratings for an app. Returns individual written reviews with aggregated rating statistics (average rating, star distribution). Also fetches the official App Store rating (average + count) from the iTunes Lookup API — set storeCountry (2-letter ISO code, default 'US') to get ratings for a specific country. Written reviews can be filtered by star rating, territory (3-letter code like 'USA', 'FRA'), and date range. Sorted by newest first by default. Requires appId from list_apps.",
  getCustomerReviewsSchema.shape,
  async (input) => handleGetCustomerReviews(getCustomerReviewsSchema.parse(input))
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("App Store Connect MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
