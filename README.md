# Unofficial App Store Connect MCP Server

<p align="center">
  <a href="https://github.com/Fourni-j/appstore-connect-MCP/releases/latest"><img src="https://img.shields.io/github/v/release/Fourni-j/appstore-connect-MCP?style=for-the-badge&color=blue" alt="Latest Release"></a>
  <a href="https://github.com/Fourni-j/appstore-connect-MCP/stargazers"><img src="https://img.shields.io/github/stars/Fourni-j/appstore-connect-MCP?style=for-the-badge" alt="GitHub Stars"></a>
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js" alt="Node Version">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License">
  <a href="https://github.com/Fourni-j/appstore-connect-MCP/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Fourni-j/appstore-connect-MCP/ci.yml?style=for-the-badge&label=CI" alt="CI"></a>
</p>

An [MCP](https://modelcontextprotocol.io/) server that gives AI assistants structured access to App Store Connect data. Built for ASO (App Store Optimization) analysis, download tracking, and performance monitoring.

The server returns agent-friendly JSON with natural-language summaries, pre-computed aggregations, and conversion rates — so an AI agent can interpret App Store data without needing domain-specific knowledge of Apple's raw report formats.

## Table of Contents

- [Quick Start](#quick-start)
- [Tools](#tools)
- [How Analytics Reports Work](#how-analytics-reports-work)
- [Response Format](#response-format)
- [Local Testing](#local-testing)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Quick Start

### Prerequisites

You need an App Store Connect API key. Create one at [App Store Connect > Users and Access > Integrations > App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api).

### Install

```bash
git clone https://github.com/Fourni-j/appstore-connect-MCP.git
cd appstore-connect-MCP
npm install
npm run build
```

### Configure your MCP client

Add to your MCP client config (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "appstore-connect": {
      "command": "node",
      "args": ["/path/to/appstore-connect-MCP/dist/index.js"],
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

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ASC_KEY_ID` | Yes | API key ID from App Store Connect |
| `ASC_ISSUER_ID` | Yes | Issuer ID from App Store Connect |
| `ASC_PRIVATE_KEY_PATH` | Yes | Path to the `.p8` private key file |
| `ASC_VENDOR_NUMBER` | For sales/downloads | Vendor number from Payments and Financial Reports |

### First command

Ask your AI assistant:

> "List my apps on App Store Connect"

## Tools

### list_apps

List all apps in the account. Returns each app's `id`, `name`, `bundleId`, and `sku`. The returned `id` is used as `appId` in all other tools.

**Parameters:** `limit` (optional, default 50, max 200)

### get_app_metadata

Get localized metadata: title, subtitle, keywords, description, and promotional text for all locales. Useful for ASO review.

**Parameters:** `appId` (required)

### get_analytics_report

Get analytics data for an app across five categories:

| Category | Metrics |
|---|---|
| `APP_STORE_ENGAGEMENT` | Impressions, page views, taps, conversion rates |
| `COMMERCE` | Downloads by type, device, territory |
| `APP_USAGE` | Sessions, active devices |
| `FRAMEWORK_USAGE` | Framework adoption |
| `PERFORMANCE` | Crashes, launch time |

Returns aggregated data per period by default, with totals and breakdowns by source/device/territory. For engagement, COMMERCE download data is automatically merged, including the conversion rate (Total Downloads / Unique Impressions) matching App Store Connect's definition exactly.

Set `raw: true` for granular per-territory/device/OS rows.

Always specify `granularity` (`DAILY` or `MONTHLY`). Without it, Apple mixes monthly and daily instances. MONTHLY covers completed months only; DAILY covers recent days. For a full picture, make two calls.

**Parameters:** `appId` (required), `category` (required), `granularity` (optional but recommended), `startDate` (optional), `endDate` (optional), `raw` (optional), `limit` (optional)

### get_sales_report

Download and parse sales/installs reports as structured JSON. Apple's raw TSV column names are mapped to readable camelCase keys. Each row includes a `productTypeLabel` with a human-readable description.

**Parameters:** `reportType` (required), `reportSubType` (required), `frequency` (required), `vendorNumber` (optional — falls back to `ASC_VENDOR_NUMBER`), `reportDate` (optional)

### get_app_store_versions

List app versions with their App Store state (`READY_FOR_SALE`, `IN_REVIEW`, etc.), creation date, and platform. Useful for correlating releases with metric changes.

**Parameters:** `appId` (required), `limit` (optional, default 10, max 50)

### get_downloads_summary

Get first-time download counts aggregated by period. Automatically uses daily granularity for ranges under 32 days, monthly otherwise. Only counts new installs (excludes updates, re-downloads, IAPs, and subscriptions).

**Parameters:** `appId` (required), `startDate` (optional), `endDate` (optional)

### get_customer_reviews

Get customer reviews and ratings for an app. Returns individual written reviews with aggregated statistics (average rating, star distribution), plus the official App Store rating from the iTunes Lookup API.

The App Store rating includes all ratings (silent star taps + written reviews) and varies by country — set `storeCountry` to get the rating for a specific market.

**Parameters:** `appId` (required), `rating` (optional, 1-5), `territory` (optional, 3-letter code like `USA`, `FRA`), `sort` (optional, default `-createdDate`), `startDate` (optional), `endDate` (optional), `storeCountry` (optional, 2-letter ISO code, default `US`), `limit` (optional, default 500, max 1000)

## How Analytics Reports Work

Analytics reports use Apple's [asynchronous reporting flow](https://developer.apple.com/documentation/appstoreconnectapi/analytics-reports). This is different from the other tools — it doesn't return data from a single API call.

**The flow:**

1. **Report request** — The server creates an `ONGOING` [analytics report request](https://developer.apple.com/documentation/appstoreconnectapi/request-analytics-reports) for your app
2. **Report generation** — Apple processes the request and produces [report instances](https://developer.apple.com/documentation/appstoreconnectapi/list-all-instances-of-a-report) (one per time period)
3. **Segment download** — Each instance contains [segments](https://developer.apple.com/documentation/appstoreconnectapi/list-all-segments-for-a-report-instance) (gzipped TSV files) that the server downloads and parses

**First-time setup:** The very first call for a given app creates the report request and returns a `"pending"` status. Apple needs time (typically a few hours, sometimes up to 24h) to generate the initial reports. Subsequent calls return data immediately.

**Why it can be slow:** Even after initial setup, fetching analytics involves multiple chained API calls. For large date ranges with many instances, this can take 10-30 seconds.

See [Apple's Analytics Reports documentation](https://developer.apple.com/documentation/appstoreconnectapi/analytics-reports) for the full API reference.

## Response Format

All tools return JSON with an agent-friendly structure:

<details>
<summary>Aggregated analytics example (APP_STORE_ENGAGEMENT)</summary>

```json
{
  "summary": "APP_STORE_ENGAGEMENT analytics from 2026-02-01 to 2026-02-28: 28 periods...",
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
      "conversionRates": { "...": "..." },
      "bySource": { "App Store Browse": 900, "App Store Search": 700 },
      "byDevice": { "iPhone": 1400, "iPad": 400 },
      "downloads": { "totalDownloads": 60, "firstTimeDownloads": 50, "redownloads": 10 }
    }
  ]
}
```

</details>

<details>
<summary>Sales report example</summary>

```json
{
  "summary": "DAILY SALES/SUMMARY report for 2026-02-15: 12 rows.",
  "totalRows": 12,
  "truncated": false,
  "data": [
    {
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

</details>

<details>
<summary>Customer reviews example</summary>

```json
{
  "summary": "App Store rating (US): 4.58 from 178 ratings. 42 written reviews (avg 3.26). Distribution: 5★=16, 4★=10, 3★=8, 2★=3, 1★=5.",
  "appId": "123",
  "storeRating": {
    "averageRating": 4.58,
    "ratingCount": 178,
    "currentVersionAverageRating": 4.58,
    "currentVersionRatingCount": 178
  },
  "totalReviews": 42,
  "averageRating": 3.26,
  "ratingDistribution": { "1": 5, "2": 3, "3": 8, "4": 10, "5": 16 },
  "truncated": false,
  "reviews": [
    {
      "id": "review-id",
      "rating": 5,
      "title": "Great app!",
      "body": "Love the barcode scanning feature.",
      "reviewerNickname": "user123",
      "territory": "USA",
      "createdDate": "2026-03-01T00:00:00Z"
    }
  ]
}
```

</details>

<details>
<summary>Error example</summary>

```json
{
  "error": "ASC_VENDOR_NUMBER environment variable is not set. Find your vendor number in App Store Connect > Payments and Financial Reports."
}
```

Error responses also set `isError: true` on the MCP result object.

</details>

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
npx tsx scripts/test-tools.ts get-analytics-report
npx tsx scripts/test-tools.ts get-customer-reviews
```

## Development

```bash
npm run build        # Compile TypeScript
npm test             # Run tests (94 tests)
npm run test:watch   # Watch mode
npm start            # Start the MCP server
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>This project is an independent, unofficial tool and is not affiliated with, endorsed by, or sponsored by Apple Inc. App Store Connect, TestFlight, and Apple are trademarks of Apple Inc., registered in the U.S. and other countries.</sub>
</p>
