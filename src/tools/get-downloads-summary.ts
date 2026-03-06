import { z } from "zod";
import { getSalesReport } from "../api/sales-reports.js";

export const getDownloadsSummarySchema = z.object({
  appId: z.string().describe("App Store Connect app ID (Apple Identifier, from list_apps)"),
  startDate: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 3 months ago."),
  endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
});

export type GetDownloadsSummaryInput = z.infer<typeof getDownloadsSummarySchema>;

// First-time app download product types (excludes updates, IAPs, subscriptions)
const DOWNLOAD_TYPES = new Set(["1", "1F", "1T"]);

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

function shouldUseDailyReports(startDate?: string, endDate?: string): boolean {
  if (!startDate) return false;
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  // Use daily reports if the range is less than 32 days
  return diffDays < 32;
}

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

function countDownloads(
  rows: Record<string, string>[],
  appId: string
): number {
  let count = 0;
  for (const row of rows) {
    if (row["Apple Identifier"] !== appId) continue;
    if (!DOWNLOAD_TYPES.has(row["Product Type Identifier"] || "")) continue;
    count += parseInt(row["Units"] || "0", 10);
  }
  return count;
}

export async function handleGetDownloadsSummary(input: GetDownloadsSummaryInput) {
  const vendorNumber = process.env.ASC_VENDOR_NUMBER;
  if (!vendorNumber) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "ASC_VENDOR_NUMBER environment variable is not set. Find your vendor number in App Store Connect > Payments and Financial Reports.",
          }),
        },
      ],
      isError: true,
    };
  }

  const useDaily = shouldUseDailyReports(input.startDate, input.endDate);
  const warnings: string[] = [];
  let totalDownloads = 0;
  const byPeriod: Record<string, number> = {};

  if (useDaily) {
    const endDate = input.endDate || new Date().toISOString().slice(0, 10);
    const dates = getDailyDates(input.startDate!, endDate);

    for (const date of dates) {
      try {
        const rows = await getSalesReport({
          vendorNumber,
          reportType: "SALES",
          reportSubType: "SUMMARY",
          frequency: "DAILY",
          reportDate: date,
        });

        const dayDownloads = countDownloads(rows, input.appId);
        totalDownloads += dayDownloads;
        byPeriod[date] = dayDownloads;
      } catch (err: any) {
        // Daily reports may not be available for today/yesterday
        if (!err.message.includes("404")) {
          warnings.push(`${date}: ${err.message}`);
        }
      }
    }
  } else {
    const months = getMonthlyDates(input.startDate, input.endDate);

    for (const month of months) {
      try {
        const rows = await getSalesReport({
          vendorNumber,
          reportType: "SALES",
          reportSubType: "SUMMARY",
          frequency: "MONTHLY",
          reportDate: month,
        });

        const monthDownloads = countDownloads(rows, input.appId);
        totalDownloads += monthDownloads;
        byPeriod[month] = monthDownloads;
      } catch (err: any) {
        warnings.push(`${month}: ${err.message}`);
      }
    }
  }

  const periods = Object.keys(byPeriod);
  const dateRange = periods.length > 0
    ? ` from ${periods[0]} to ${periods[periods.length - 1]}`
    : "";
  const summary = `${totalDownloads.toLocaleString()} first-time downloads${dateRange} (${useDaily ? "daily" : "monthly"} granularity). Only counts new installs (product types 1, 1F, 1T), excludes updates, re-downloads, IAPs, and subscriptions.`;

  const result = {
    summary,
    appId: input.appId,
    totalDownloads,
    frequency: useDaily ? "DAILY" : "MONTHLY",
    byPeriod,
    ...(warnings.length > 0 ? { warnings } : {}),
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result),
      },
    ],
  };
}
