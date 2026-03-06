import { z } from "zod";
import { getAnalyticsReport, type AnalyticsCategory } from "../api/analytics.js";

const MAX_RAW_ROWS = 500;

export const getAnalyticsReportSchema = z.object({
  appId: z.string().describe("App Store Connect app ID (from list_apps)"),
  category: z
    .enum(["APP_STORE_ENGAGEMENT", "COMMERCE", "APP_USAGE", "FRAMEWORK_USAGE", "PERFORMANCE"])
    .describe("Analytics report category"),
  granularity: z
    .enum(["DAILY", "WEEKLY", "MONTHLY"])
    .optional()
    .describe("Report granularity. Always specify this — DAILY for recent days, MONTHLY for older data. Without it, Apple mixes monthly and daily instances together."),
  startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
  raw: z.boolean().optional().describe("If true, return raw rows instead of aggregated summary. Default false."),
  limit: z.number().min(1).max(5000).optional().describe("Max raw rows to return when raw=true (default 500)"),
});

export type GetAnalyticsReportInput = z.infer<typeof getAnalyticsReportSchema>;

interface DownloadMetrics {
  totalDownloads: number;
  firstTimeDownloads: number;
  redownloads: number;
  updates: number;
}

interface DayMetrics {
  date: string;
  counts: Record<string, number>;
  uniqueCounts: Record<string, number>;
  conversionRates: Record<string, string>;
  bySource: Record<string, number>;
  byDevice: Record<string, number>;
  downloads?: DownloadMetrics;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return (numerator / denominator * 100).toFixed(2) + "%";
}

function aggregateCommerceByDate(rows: Record<string, string>[]): Map<string, DownloadMetrics> {
  const byDate = new Map<string, DownloadMetrics>();

  for (const row of rows) {
    const date = row["Date"] || "";
    if (!date) continue;

    let day = byDate.get(date);
    if (!day) {
      day = { totalDownloads: 0, firstTimeDownloads: 0, redownloads: 0, updates: 0 };
      byDate.set(date, day);
    }

    const downloadType = row["Download Type"] || "";
    const count = parseInt(row["Counts"] || "0", 10);

    switch (downloadType) {
      case "First-time download":
        day.firstTimeDownloads += count;
        day.totalDownloads += count;
        break;
      case "Redownload":
        day.redownloads += count;
        day.totalDownloads += count;
        break;
      case "Auto-update":
      case "Manual update":
        day.updates += count;
        break;
      // Restore and others are not counted as downloads
    }
  }

  return byDate;
}

function computeEngagementConversionRates(
  counts: Record<string, number>,
  uniqueCounts: Record<string, number>,
): Record<string, string> {
  const uniqueImpressions = uniqueCounts["Impression"] || 0;
  const uniquePageViews = uniqueCounts["Page view"] || 0;
  const uniqueTaps = uniqueCounts["Tap"] || 0;
  return {
    "tapRate (Unique Taps / Unique Impressions)": pct(uniqueTaps, uniqueImpressions),
    "pageViewRate (Unique Page Views / Unique Impressions)": pct(uniquePageViews, uniqueImpressions),
  };
}

function aggregateEngagement(rows: Record<string, string>[]): DayMetrics[] {
  const byDate = new Map<string, Omit<DayMetrics, "conversionRates">>();

  for (const row of rows) {
    const date = row["Date"] || "";
    if (!date) continue;

    let day = byDate.get(date);
    if (!day) {
      day = { date, counts: {}, uniqueCounts: {}, bySource: {}, byDevice: {} };
      byDate.set(date, day);
    }

    const event = row["Event"] || "Unknown";
    const count = parseInt(row["Counts"] || "0", 10);
    const unique = parseInt(row["Unique Counts"] || "0", 10);
    const source = row["Source Type"] || "Unknown";
    const device = row["Device"] || "Unknown";

    day.counts[event] = (day.counts[event] || 0) + count;
    day.uniqueCounts[event] = (day.uniqueCounts[event] || 0) + unique;
    day.bySource[source] = (day.bySource[source] || 0) + count;
    day.byDevice[device] = (day.byDevice[device] || 0) + count;
  }

  return Array.from(byDate.values())
    .map((day) => ({
      ...day,
      conversionRates: computeEngagementConversionRates(day.counts, day.uniqueCounts),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

interface CommerceDay {
  date: string;
  counts: Record<string, number>;
  byDevice: Record<string, number>;
  byTerritory: Record<string, number>;
}

function aggregateCommerce(rows: Record<string, string>[]): CommerceDay[] {
  const byDate = new Map<string, CommerceDay>();

  for (const row of rows) {
    const date = row["Date"] || "";
    if (!date) continue;

    let day = byDate.get(date);
    if (!day) {
      day = { date, counts: {}, byDevice: {}, byTerritory: {} };
      byDate.set(date, day);
    }

    const downloadType = row["Download Type"] || row["Event"] || row["Metric"] || "Unknown";
    const count = parseInt(row["Counts"] || row["Count"] || "0", 10);
    const device = row["Device"] || "Unknown";
    const territory = row["Territory"] || "Unknown";

    day.counts[downloadType] = (day.counts[downloadType] || 0) + count;
    day.byDevice[device] = (day.byDevice[device] || 0) + count;
    day.byTerritory[territory] = (day.byTerritory[territory] || 0) + count;
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

interface UsageDay {
  date: string;
  counts: Record<string, number>;
  byDevice: Record<string, number>;
}

function aggregateUsage(rows: Record<string, string>[]): UsageDay[] {
  const byDate = new Map<string, UsageDay>();

  for (const row of rows) {
    const date = row["Date"] || "";
    if (!date) continue;

    let day = byDate.get(date);
    if (!day) {
      day = { date, counts: {}, byDevice: {} };
      byDate.set(date, day);
    }

    const event = row["Event"] || row["Metric"] || "Unknown";
    const count = parseInt(row["Counts"] || row["Count"] || "0", 10);
    const device = row["Device"] || "Unknown";

    day.counts[event] = (day.counts[event] || 0) + count;
    day.byDevice[device] = (day.byDevice[device] || 0) + count;
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

interface GenericDay {
  date: string;
  counts: Record<string, number>;
}

function aggregateGeneric(rows: Record<string, string>[]): GenericDay[] {
  const byDate = new Map<string, GenericDay>();

  for (const row of rows) {
    const date = row["Date"] || "";
    if (!date) continue;

    let day = byDate.get(date);
    if (!day) {
      day = { date, counts: {} };
      byDate.set(date, day);
    }

    const event = row["Event"] || row["Metric"] || "Unknown";
    const count = parseInt(row["Counts"] || row["Count"] || "0", 10);

    day.counts[event] = (day.counts[event] || 0) + count;
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function computeTotals(rows: Record<string, string>[]): { counts: Record<string, number>; uniqueCounts: Record<string, number> } {
  const counts: Record<string, number> = {};
  const uniqueCounts: Record<string, number> = {};
  for (const row of rows) {
    const event = row["Event"] || row["Metric"] || "Unknown";
    const count = parseInt(row["Counts"] || row["Count"] || "0", 10);
    const unique = parseInt(row["Unique Counts"] || "0", 10);
    counts[event] = (counts[event] || 0) + count;
    uniqueCounts[event] = (uniqueCounts[event] || 0) + unique;
  }
  return { counts, uniqueCounts };
}

function aggregate(category: string, rows: Record<string, string>[]) {
  switch (category) {
    case "APP_STORE_ENGAGEMENT":
      return aggregateEngagement(rows);
    case "COMMERCE":
      return aggregateCommerce(rows);
    case "APP_USAGE":
      return aggregateUsage(rows);
    default:
      return aggregateGeneric(rows);
  }
}

export async function handleGetAnalyticsReport(input: GetAnalyticsReportInput) {
  const result = await getAnalyticsReport({
    appId: input.appId,
    category: input.category as AnalyticsCategory,
    granularity: input.granularity,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  if (result.status === "pending") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "pending", message: result.message }),
        },
      ],
    };
  }

  const allRows = result.data;
  const totalRawRows = allRows.length;

  // Date range from all data
  const dates = allRows.map((r) => r["Date"] || "").filter(Boolean).sort();
  const dateRange = dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null;

  // Raw mode: return rows with truncation
  if (input.raw) {
    const maxRows = input.limit ?? MAX_RAW_ROWS;
    const truncated = totalRawRows > maxRows;
    const data = truncated ? allRows.slice(0, maxRows) : allRows;

    const summary = `${input.category} raw data: ${totalRawRows} rows${dateRange ? ` from ${dateRange.from} to ${dateRange.to}` : ""}${truncated ? ` (showing first ${maxRows})` : ""}.`;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ summary, status: "ready", totalRawRows, truncated, data }),
        },
      ],
    };
  }

  // Aggregated mode (default)
  const totals = computeTotals(allRows);
  const periods = aggregate(input.category, allRows);

  // Detect granularity: if periods are consecutive days, it's daily; otherwise mixed/monthly
  const granularityNote = (() => {
    if (periods.length < 2) return "";
    const sortedDates = periods.map((p) => p.date).sort();
    const gaps = [];
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      gaps.push(Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)));
    }
    const allDaily = gaps.every((g) => g === 1);
    const allMonthly = gaps.every((g) => g >= 28 && g <= 31);
    if (allDaily) return "daily";
    if (allMonthly) return "monthly";
    return "mixed (periods may span different time ranges — check dates carefully)";
  })();

  // Enrich engagement with COMMERCE download data
  let commerceByDate: Map<string, DownloadMetrics> | undefined;
  let totalDownloads: DownloadMetrics | undefined;

  if (input.category === "APP_STORE_ENGAGEMENT") {
    try {
      const commerceResult = await getAnalyticsReport({
        appId: input.appId,
        category: "COMMERCE",
        granularity: input.granularity,
        startDate: input.startDate,
        endDate: input.endDate,
      });

      if (commerceResult.status === "ready") {
        commerceByDate = aggregateCommerceByDate(commerceResult.data);

        // Attach downloads to each period and compute conversion rate
        for (const period of periods as DayMetrics[]) {
          const downloads = commerceByDate.get(period.date);
          if (downloads) {
            period.downloads = downloads;
            const uniqueImpressions = period.uniqueCounts["Impression"] || 0;
            if (uniqueImpressions > 0) {
              period.conversionRates["conversionRate (Total Downloads / Unique Impressions)"] =
                pct(downloads.totalDownloads, uniqueImpressions);
            }
          }
        }

        // Compute total downloads across all periods
        totalDownloads = { totalDownloads: 0, firstTimeDownloads: 0, redownloads: 0, updates: 0 };
        for (const dl of commerceByDate.values()) {
          totalDownloads.totalDownloads += dl.totalDownloads;
          totalDownloads.firstTimeDownloads += dl.firstTimeDownloads;
          totalDownloads.redownloads += dl.redownloads;
          totalDownloads.updates += dl.updates;
        }
      }
    } catch {
      // COMMERCE data may not be available — continue without it
    }
  }

  // Conversion rates on totals (engagement only)
  const totalConversionRates = input.category === "APP_STORE_ENGAGEMENT"
    ? computeEngagementConversionRates(totals.counts, totals.uniqueCounts)
    : undefined;

  if (totalConversionRates && totalDownloads) {
    const uniqueImpressions = totals.uniqueCounts["Impression"] || 0;
    if (uniqueImpressions > 0) {
      totalConversionRates["conversionRate (Total Downloads / Unique Impressions)"] =
        pct(totalDownloads.totalDownloads, uniqueImpressions);
    }
  }

  const totalsList = Object.entries(totals.counts)
    .map(([event, count]) => `${event}: ${count.toLocaleString()}`)
    .join(", ");

  const ratesSummary = totalConversionRates
    ? ` Rates: tap ${totalConversionRates["tapRate (Unique Taps / Unique Impressions)"]}, page view ${totalConversionRates["pageViewRate (Unique Page Views / Unique Impressions)"]}${totalConversionRates["conversionRate (Total Downloads / Unique Impressions)"] ? `, conversion ${totalConversionRates["conversionRate (Total Downloads / Unique Impressions)"]}` : ""}.`
    : "";

  const downloadsSummary = totalDownloads
    ? ` Downloads: ${totalDownloads.totalDownloads} (${totalDownloads.firstTimeDownloads} first-time, ${totalDownloads.redownloads} redownloads).`
    : "";

  const granularityLabel = input.granularity?.toLowerCase() || granularityNote || "unknown";
  const summary = `${input.category} analytics${dateRange ? ` from ${dateRange.from} to ${dateRange.to}` : ""}: ${periods.length} period${periods.length !== 1 ? "s" : ""} (${granularityLabel} granularity, ${totalRawRows.toLocaleString()} raw rows aggregated). Each entry's "date" is the period start — not necessarily a single day. Totals: ${totalsList}.${ratesSummary}${downloadsSummary}`;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          summary,
          status: "ready",
          granularity: granularityLabel,
          dateRange,
          totals: totals.counts,
          uniqueTotals: totals.uniqueCounts,
          ...(totalConversionRates ? { conversionRates: totalConversionRates } : {}),
          ...(totalDownloads ? { downloads: totalDownloads } : {}),
          periods,
        }),
      },
    ],
  };
}
