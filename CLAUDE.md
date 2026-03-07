# App Store Connect MCP Server

## Open Source Project — IMPORTANT

This is a **public open-source repository**. Every change you make may be seen by anyone. Follow these rules strictly:

### Never leak secrets
- **NEVER** hardcode, log, or commit API keys, key IDs, issuer IDs, vendor numbers, private key paths, or any credential.
- **NEVER** include real app IDs, bundle IDs, or user-specific data in code, tests, comments, or documentation. Use placeholder values (e.g., `"your-key-id"`, `"123"`, `"com.example.myapp"`).
- If a tool call result or conversation context contains real credentials or user data, do **not** copy it into any file.

### Keep documentation up to date
When adding, modifying, or removing a tool or feature:
1. **README.md** — Update the Tools section (parameters, description), response examples, test count, and local testing commands.
2. **CLAUDE.md** — Update the Architecture tree, Key Patterns, and Agent-Friendly Response Format sections.
3. **Tool description in `index.ts`** — Keep the `server.tool()` description accurate and complete for agent consumption.
4. **`scripts/test-tools.ts`** — Add an integration test block for any new tool.

### Tests are mandatory
- Every new tool handler must have a corresponding test file in `src/__tests__/`.
- All tests must pass (`npm test`) before considering work complete.
- Keep the test count in README.md accurate.

## Build & Test

```bash
npm run build    # TypeScript compilation
npm test         # Run all tests (vitest)
npm run test:watch  # Watch mode
npx tsx scripts/test-tools.ts              # Run all tools against the real API
npx tsx scripts/test-tools.ts list-apps    # Run a single tool
```

## Architecture

```
src/
  index.ts              # MCP server entry point, tool registration and descriptions
  auth.ts               # JWT generation + caching for App Store Connect API
  api/
    client.ts           # HTTP client with retry logic (429/5xx backoff) + fetchUrl for pre-signed S3 URLs
    apps.ts             # Apps, metadata, and versions API calls (with in-memory app list cache)
    sales-reports.ts    # Sales reports (gzip download + TSV parsing)
    analytics.ts        # Analytics reports (async report request/instance/segment flow, with segment cache)
    reviews.ts          # Customer reviews (paginated) + App Store rating via iTunes Lookup API
  tools/
    list-apps.ts        # List apps — returns id, name, bundleId, SKU
    get-app-metadata.ts # Localized metadata — name, subtitle, keywords, description, promotionalText
    get-sales-report.ts # Sales/installs reports — column mapping, product type labels, truncation
    get-analytics-report.ts  # Analytics — aggregated or raw mode, engagement enriched with COMMERCE data
    get-app-store-versions.ts  # App versions with App Store state
    get-downloads-summary.ts   # Download trends — daily/monthly auto-selection from sales reports
    get-customer-reviews.ts  # Customer reviews — written reviews + App Store rating, date/rating/territory filtering
  utils/
    tsv.ts              # TSV parser (first row = headers)
    compression.ts      # Gzip decompression via node:zlib
  __tests__/            # Unit tests (vitest)
scripts/
  test-tools.ts         # Manual integration test — calls handlers against the real API
```

## Key Patterns

- **Auth**: JWT tokens cached for 15 min (20 min lifetime minus 5 min margin). Module-level cache in `auth.ts`.
- **API Client**: Auto-retry on 429/5xx with exponential backoff (max 3 attempts). Non-retryable errors throw `ApiError`. `fetchUrl` is used for pre-signed S3 download URLs (no Authorization header).
- **Sales Reports**: Responses are gzipped TSV. Pipeline: `apiRequest` -> `gunzipToString` -> `parseTSV`.
- **Analytics Flow**: Async multi-step flow: create/find report request -> list reports by category -> filter instances by granularity/date -> download segments -> parse TSV. Report request IDs and segment data are cached in memory.
- **Customer Reviews**: Written reviews from App Store Connect API + official App Store rating from iTunes Lookup API (public, no auth). The two fetches run in parallel. iTunes Lookup returns per-country ratings (controlled by `storeCountry` param).
- **Tool Handlers**: Each tool has a Zod schema export and an async handler export. Handlers return MCP `content` arrays with a single JSON text entry.
- **ESM**: Project uses ES modules (`"type": "module"` in package.json). Use `.js` extensions in imports.

## Agent-Friendly Response Format

All tool handlers return structured JSON designed for easy consumption by AI agents. Key conventions:

### summary field

Every response includes a `summary` string at the top level with a natural-language description of the result. This lets agents quickly understand the data without parsing the full payload.

### Sales report column mapping

`get-sales-report` maps Apple's raw TSV column names to camelCase keys (e.g., `"Product Type Identifier"` becomes `"productType"`, `"Customer Price"` becomes `"customerPrice"`). Each row also gets a `productTypeLabel` field with a human-readable label (e.g., `"Free or Paid App (Universal)"`, `"In-App Purchase (Auto-Renewable Sub)"`).

### Analytics aggregation

`get-analytics-report` aggregates raw rows by default (aggregated mode). For `APP_STORE_ENGAGEMENT`, each period contains:
- `counts` — total event counts (Impression, Page view, Tap, etc.)
- `uniqueCounts` — unique event counts
- `conversionRates` — tap rate and page view rate computed from unique counts
- `bySource` — counts broken down by source type
- `byDevice` — counts broken down by device
- `downloads` — COMMERCE download data (totalDownloads, firstTimeDownloads, redownloads, updates) automatically fetched and merged

For `COMMERCE`, each period has `counts` (by download type), `byDevice`, `byTerritory`. For `APP_USAGE`, each period has `counts` (by event) and `byDevice`. Other categories get generic `counts` by event.

Top-level totals include `totals`, `uniqueTotals`, and for engagement: `conversionRates` and `downloads`.

### Conversion rate

The conversion rate matches App Store Connect's definition: Total Downloads / Unique Impressions. Download data comes from the COMMERCE category and is automatically fetched when requesting APP_STORE_ENGAGEMENT.

### Raw mode

Set `raw: true` on `get-analytics-report` to get granular per-territory/device/OS rows instead of aggregated periods. Useful when the agent needs to drill into specific dimensions.

### Granularity

Always specify `granularity` (DAILY or MONTHLY) for analytics. Without it, Apple returns a mix of monthly and daily instances, which produces misleading aggregations. MONTHLY only covers completed months; DAILY only covers recent days. To get a full picture, make two calls (one MONTHLY, one DAILY).

### Customer reviews and ratings

`get-customer-reviews` returns two types of rating data:
- **`storeRating`** — the official App Store average rating and count from the iTunes Lookup API (`itunes.apple.com/lookup`). This includes all ratings (silent star taps + written reviews). Set `storeCountry` (2-letter ISO code, default `US`) to get per-country ratings. Returns `averageRating`, `ratingCount`, `currentVersionAverageRating`, `currentVersionRatingCount`. Omitted if the lookup fails.
- **Written reviews** — individual reviews fetched from the App Store Connect API (`/v1/apps/{id}/customerReviews`). Aggregated into `averageRating`, `ratingDistribution`, and `totalReviews` (these only reflect written reviews, not all ratings).

Reviews can be filtered server-side by `rating` (1-5) and `territory` (3-letter code like `USA`, `FRA`), and client-side by `startDate`/`endDate`. Date filtering early-stops when sorted by `-createdDate`. Pagination follows `links.next` up to `limit` (default 500, max 1000). Response truncates at 500 reviews.

### Truncation

Large result sets are truncated. Responses include `totalRows` (or `totalRawRows`) and a `truncated` boolean so the agent knows when data was cut off. Sales reports truncate at 500 rows; analytics raw mode defaults to 500 (configurable via `limit`, max 5000).

### Error handling

Error responses set `isError: true` on the MCP result and include an `error` string in the JSON body. This applies to missing configuration (e.g., no vendor number) and API failures.

### Vendor number auto-resolution

`get-sales-report` and `get-downloads-summary` auto-resolve the vendor number from the `ASC_VENDOR_NUMBER` environment variable. The `vendorNumber` parameter on `get-sales-report` is optional and overrides the env var when provided.

## Coding Guidelines

- TypeScript strict mode is on
- Use `node:` prefix for Node.js built-in imports
- All tool handlers follow the pattern: Zod schema export + handler function export
- Tests use vitest with `vi.mock()` for module mocking
- Never include real credentials, app IDs, or user data in code or tests — use generic placeholders
