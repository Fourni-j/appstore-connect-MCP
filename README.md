# Unofficial App Store Connect MCP Server

An MCP (Model Context Protocol) server that gives AI assistants structured access to App Store Connect data. Built for ASO (App Store Optimization) analysis, download tracking, and performance monitoring.

The server returns agent-friendly JSON with natural-language summaries, mapped column names, pre-computed aggregations, and conversion rates -- so an AI agent can interpret App Store data without needing domain-specific knowledge of Apple's raw report formats.

## Setup

### Prerequisites

You need an App Store Connect API key. Create one at [App Store Connect > Users and Access > Integrations > App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api).

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ASC_KEY_ID` | Yes | API key ID from App Store Connect |
| `ASC_ISSUER_ID` | Yes | Issuer ID from App Store Connect |
| `ASC_PRIVATE_KEY_PATH` | Yes | Path to the `.p8` private key file |
| `ASC_VENDOR_NUMBER` | For sales/downloads | Vendor number (found in Payments and Financial Reports). Auto-resolved by `get_sales_report` and `get_downloads_summary`. |

### Installation

```bash
npm install
npm run build
```

### MCP Configuration

Add to your MCP client config (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "appstore-connect": {
      "command": "node",
      "args": ["/path/to/appstore-connect-mcp/dist/index.js"],
      "env": {
        "ASC_KEY_ID": "your-key-id",
        "ASC_ISSUER_ID": "your-issuer-id",
        "ASC_PRIVATE_KEY_PATH": "/path/to/AuthKey_XXXX.p8",
        "ASC_VENDOR_NUMBER": "your-vendor-number"
      }
    }
  }
}
```

## Available Tools

### list_apps

List all apps in the App Store Connect account. Returns each app's `id`, `name`, `bundleId`, and `sku`. The returned `id` is used as `appId` in all other tools.

**Parameters:** `limit` (optional, default 50, max 200)

### get_app_metadata

Get localized metadata for an app: title, subtitle, keywords, description, and promotional text for all locales. Useful for ASO review.

**Parameters:** `appId` (required)

### get_sales_report

Download and parse App Store Connect sales/installs reports as structured JSON. Apple's raw TSV column names are mapped to readable camelCase keys (e.g., `productType`, `customerPrice`, `countryCode`). Each row includes a `productTypeLabel` with a human-readable description (e.g., "Free or Paid App (Universal)", "In-App Purchase (Auto-Renewable Sub)").

**Parameters:** `reportType` (required), `reportSubType` (required), `frequency` (required), `vendorNumber` (optional -- falls back to `ASC_VENDOR_NUMBER` env var), `reportDate` (optional)

### get_analytics_report

Get analytics data for an app. Categories: `APP_STORE_ENGAGEMENT` (impressions, page views, taps), `COMMERCE` (downloads, purchases), `APP_USAGE` (sessions, active devices), `FRAMEWORK_USAGE`, `PERFORMANCE` (crashes, launch time).

By default returns aggregated data per period with totals, breakdowns by source/device/territory, and conversion rates. For engagement, COMMERCE download data is automatically fetched and merged, including the conversion rate (Total Downloads / Unique Impressions) matching App Store Connect's definition.

Set `raw: true` for granular per-territory/device/OS rows.

Always specify `granularity` (`DAILY` or `MONTHLY`). Without it, Apple mixes monthly and daily instances. MONTHLY covers completed months only; DAILY covers recent days only. For a full picture, make two calls.

**Parameters:** `appId` (required), `category` (required), `granularity` (optional but recommended), `startDate` (optional), `endDate` (optional), `raw` (optional, default false), `limit` (optional, max raw rows when raw=true)

#### How analytics reports work

Analytics reports use Apple's [asynchronous reporting flow](https://developer.apple.com/documentation/appstoreconnectapi/analytics-reports). This is fundamentally different from the other tools — it doesn't return data from a single API call.

**The flow:**

1. **Report request** — The server creates an `ONGOING` [analytics report request](https://developer.apple.com/documentation/appstoreconnectapi/request-analytics-reports) for your app. This tells Apple to start generating reports.
2. **Report generation** — Apple processes the request and produces [report instances](https://developer.apple.com/documentation/appstoreconnectapi/list-all-instances-of-a-report) (one per time period). This happens on Apple's side.
3. **Segment download** — Each instance contains one or more [segments](https://developer.apple.com/documentation/appstoreconnectapi/list-all-segments-for-a-report-instance) (gzipped TSV files) that the server downloads and parses.

**First-time setup:** The very first call for a given app will create the report request and return a `"pending"` status. Apple needs time (typically a few hours, sometimes up to 24h) to generate the initial reports. Subsequent calls will return data immediately, as the server caches report request IDs and segment data.

**Why it can be slow:** Even after initial setup, fetching analytics involves multiple chained API calls (list reports → list instances → list segments → download each segment). For large date ranges with many instances, this can take 10-30 seconds.

See [Apple's Analytics Reports documentation](https://developer.apple.com/documentation/appstoreconnectapi/analytics-reports) for the full API reference.

### get_app_store_versions

List app versions with their App Store state (`READY_FOR_SALE`, `IN_REVIEW`, etc.), creation date, and platform. Useful for correlating releases with metric changes.

**Parameters:** `appId` (required), `limit` (optional, default 10, max 50)

### get_downloads_summary

Get first-time download counts aggregated by period. Automatically uses daily granularity for ranges under 32 days, monthly otherwise. Only counts new installs (excludes updates, re-downloads, IAPs, and subscriptions). Requires `ASC_VENDOR_NUMBER` env var.

**Parameters:** `appId` (required), `startDate` (optional), `endDate` (optional)

## Response Format

All tools return JSON with an agent-friendly structure:

### Aggregated analytics example (APP_STORE_ENGAGEMENT)

```json
{
  "summary": "APP_STORE_ENGAGEMENT analytics from 2026-02-01 to 2026-02-28: 28 periods (daily granularity, 1,204 raw rows aggregated). Totals: Impression: 50,000, Page view: 8,000, Tap: 3,200. Rates: tap 12.50%, page view 30.00%, conversion 4.50%. Downloads: 1,800 (1,500 first-time, 300 redownloads).",
  "status": "ready",
  "granularity": "daily",
  "dateRange": { "from": "2026-02-01", "to": "2026-02-28" },
  "totals": { "Impression": 50000, "Page view": 8000, "Tap": 3200 },
  "uniqueTotals": { "Impression": 40000, "Page view": 7000, "Tap": 2800 },
  "conversionRates": {
    "tapRate (Unique Taps / Unique Impressions)": "7.00%",
    "pageViewRate (Unique Page Views / Unique Impressions)": "17.50%",
    "conversionRate (Total Downloads / Unique Impressions)": "4.50%"
  },
  "downloads": {
    "totalDownloads": 1800,
    "firstTimeDownloads": 1500,
    "redownloads": 300,
    "updates": 500
  },
  "periods": [
    {
      "date": "2026-02-01",
      "counts": { "Impression": 1800, "Page view": 290, "Tap": 115 },
      "uniqueCounts": { "Impression": 1400, "Page view": 250, "Tap": 100 },
      "conversionRates": {
        "tapRate (Unique Taps / Unique Impressions)": "7.14%",
        "pageViewRate (Unique Page Views / Unique Impressions)": "17.86%",
        "conversionRate (Total Downloads / Unique Impressions)": "4.29%"
      },
      "bySource": { "App Store Browse": 900, "App Store Search": 700, "Web Referrer": 200 },
      "byDevice": { "iPhone": 1400, "iPad": 400 },
      "downloads": {
        "totalDownloads": 60,
        "firstTimeDownloads": 50,
        "redownloads": 10,
        "updates": 18
      }
    }
  ]
}
```

### Sales report example

```json
{
  "summary": "DAILY SALES/SUMMARY report for 2026-02-15: 12 rows.",
  "totalRows": 12,
  "truncated": false,
  "data": [
    {
      "provider": "APPLE",
      "title": "My App",
      "sku": "com.example.myapp",
      "units": "5",
      "customerPrice": "0",
      "productType": "1",
      "productTypeLabel": "Free or Paid App (Universal)",
      "countryCode": "US",
      "device": "iPhone"
    }
  ]
}
```

### Error example

```json
{
  "error": "ASC_VENDOR_NUMBER environment variable is not set. Find your vendor number in App Store Connect > Payments and Financial Reports."
}
```

Error responses also set `isError: true` on the MCP result object.

## Local Testing

Run tool handlers directly against the real App Store Connect API:

```bash
# Set environment variables first
export ASC_KEY_ID="your-key-id"
export ASC_ISSUER_ID="your-issuer-id"
export ASC_PRIVATE_KEY_PATH="/path/to/AuthKey_XXXX.p8"
export ASC_VENDOR_NUMBER="your-vendor-number"

# Run all tools
npx tsx scripts/test-tools.ts

# Run a specific tool
npx tsx scripts/test-tools.ts list-apps
npx tsx scripts/test-tools.ts get-app-metadata
npx tsx scripts/test-tools.ts get-sales-report
npx tsx scripts/test-tools.ts get-analytics-report
npx tsx scripts/test-tools.ts get-app-store-versions
npx tsx scripts/test-tools.ts get-downloads-summary
```

## Development

```bash
npm run build    # Compile TypeScript
npm test         # Run tests
npm start        # Start the MCP server
```
