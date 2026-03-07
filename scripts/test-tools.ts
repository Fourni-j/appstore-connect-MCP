/**
 * Manual test script — calls each tool handler against the real API
 * and prints the response an agent would see.
 *
 * Usage:
 *   npx tsx scripts/test-tools.ts [tool-name]
 *
 * Examples:
 *   npx tsx scripts/test-tools.ts              # run all tools
 *   npx tsx scripts/test-tools.ts list-apps    # run one tool
 */

import { handleListApps } from "../src/tools/list-apps.js";
import { handleGetAppMetadata } from "../src/tools/get-app-metadata.js";
import { handleGetAppStoreVersions } from "../src/tools/get-app-store-versions.js";
import { handleGetSalesReport } from "../src/tools/get-sales-report.js";
import { handleGetDownloadsSummary } from "../src/tools/get-downloads-summary.js";
import { handleGetAnalyticsReport } from "../src/tools/get-analytics-report.js";
import { handleGetCustomerReviews } from "../src/tools/get-customer-reviews.js";

const SEPARATOR = "\n" + "=".repeat(70) + "\n";

async function run(name: string, fn: () => Promise<any>) {
  console.log(SEPARATOR);
  console.log(`TOOL: ${name}`);
  console.log(SEPARATOR);
  try {
    const result = await fn();
    const text = result.content[0].text;
    // Parse and re-pretty-print for readability in the terminal
    const parsed = JSON.parse(text);
    console.log(JSON.stringify(parsed, null, 2));
    if (result.isError) {
      console.log("\n[isError: true]");
    }
  } catch (err: any) {
    console.error(`ERROR: ${err.message}`);
  }
}

async function main() {
  const filter = process.argv[2];

  // Step 1: list apps to get an appId for subsequent calls
  let appId: string | undefined;

  if (!filter || filter === "list-apps") {
    await run("list_apps", () => handleListApps({ limit: 5 }));
  }

  // Get first app ID for other tools
  try {
    const listResult = await handleListApps({ limit: 1 });
    const parsed = JSON.parse(listResult.content[0].text);
    appId = parsed.apps?.[0]?.id;
  } catch {
    console.error("Could not fetch app list — skipping app-specific tools");
  }

  if (appId) {
    console.log(`\nUsing appId: ${appId}\n`);

    if (!filter || filter === "get-app-metadata") {
      await run("get_app_metadata", () => handleGetAppMetadata({ appId: appId! }));
    }

    if (!filter || filter === "get-app-store-versions") {
      await run("get_app_store_versions", () =>
        handleGetAppStoreVersions({ appId: appId!, limit: 5 })
      );
    }

    if (!filter || filter === "get-sales-report") {
      await run("get_sales_report", () =>
        handleGetSalesReport({
          reportType: "SALES",
          reportSubType: "SUMMARY",
          frequency: "DAILY",
        })
      );
    }

    if (!filter || filter === "get-downloads-summary") {
      await run("get_downloads_summary", () =>
        handleGetDownloadsSummary({
          appId: appId!,
          startDate: "2026-02-01",
          endDate: "2026-02-07",
        })
      );
    }

    if (!filter || filter === "get-customer-reviews") {
      await run("get_customer_reviews", () =>
        handleGetCustomerReviews({ appId: appId!, limit: 20 })
      );
    }

    if (!filter || filter === "get-analytics-report") {
      await run("get_analytics_report", () =>
        handleGetAnalyticsReport({
          appId: appId!,
          category: "APP_STORE_ENGAGEMENT",
          limit: 10,
        })
      );
    }
  }

  console.log(SEPARATOR);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
