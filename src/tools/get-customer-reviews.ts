import { z } from "zod";
import { getCustomerReviews, getAppStoreRating } from "../api/reviews.js";

export const getCustomerReviewsSchema = z.object({
  appId: z.string().describe("App Store Connect app ID (from list_apps)"),
  rating: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("Filter by star rating (1-5)"),
  territory: z
    .string()
    .optional()
    .describe("Filter by territory code (e.g. 'USA')"),
  sort: z
    .enum(["createdDate", "-createdDate", "rating", "-rating"])
    .optional()
    .default("-createdDate")
    .describe("Sort order (default: -createdDate, newest first)"),
  startDate: z
    .string()
    .optional()
    .describe("Filter reviews on or after this date (YYYY-MM-DD)"),
  endDate: z
    .string()
    .optional()
    .describe("Filter reviews on or before this date (YYYY-MM-DD)"),
  storeCountry: z
    .string()
    .optional()
    .default("US")
    .describe(
      "ISO 2-letter country code for App Store rating lookup (default 'US'). Ratings vary by country."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(500)
    .describe("Max reviews to fetch (default 500, max 1000)"),
});

export type GetCustomerReviewsInput = z.input<typeof getCustomerReviewsSchema>;

const RESPONSE_TRUNCATION_LIMIT = 500;

export async function handleGetCustomerReviews(
  input: GetCustomerReviewsInput
) {
  const appId = input.appId;
  const rating = input.rating;
  const territory = input.territory;
  const sort = input.sort ?? "-createdDate";
  const startDate = input.startDate;
  const endDate = input.endDate;
  const storeCountry = input.storeCountry ?? "US";
  const limit = input.limit ?? 500;

  const [{ reviews: allReviews }, storeRating] = await Promise.all([
    getCustomerReviews(appId, { rating, territory, sort, limit }),
    getAppStoreRating(appId, storeCountry),
  ]);

  // Client-side date filtering
  let filtered = allReviews;
  if (startDate || endDate) {
    const sortDescending = sort === "-createdDate";
    filtered = [];
    for (const review of allReviews) {
      const reviewDate = review.createdDate.slice(0, 10); // YYYY-MM-DD
      if (startDate && reviewDate < startDate) {
        if (sortDescending) break; // Early stop: all subsequent reviews are older
        continue;
      }
      if (endDate && reviewDate > endDate) {
        continue;
      }
      filtered.push(review);
    }
  }

  // Compute aggregation from all filtered reviews
  const ratingDistribution: Record<string, number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };
  let ratingSum = 0;
  for (const review of filtered) {
    ratingDistribution[String(review.rating)]++;
    ratingSum += review.rating;
  }

  const totalReviews = filtered.length;
  const averageRating =
    totalReviews > 0
      ? Math.round((ratingSum / totalReviews) * 100) / 100
      : null;

  // Truncate for response
  const truncated = filtered.length > RESPONSE_TRUNCATION_LIMIT;
  const reviews = truncated
    ? filtered.slice(0, RESPONSE_TRUNCATION_LIMIT)
    : filtered;

  // Build distribution string
  const distStr = [5, 4, 3, 2, 1]
    .map((s) => `${s}\u2605=${ratingDistribution[String(s)]}`)
    .join(", ");

  const storeStr = storeRating
    ? `App Store rating (${storeCountry}): ${storeRating.averageRating.toFixed(2)} from ${storeRating.ratingCount} ratings. `
    : "";
  const avgStr =
    averageRating !== null ? ` (avg ${averageRating.toFixed(2)})` : "";
  const summary = `${storeStr}${totalReviews} written review${totalReviews !== 1 ? "s" : ""}${avgStr}. Distribution: ${distStr}.`;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          summary,
          appId,
          storeRating: storeRating ?? undefined,
          totalReviews,
          averageRating,
          ratingDistribution,
          truncated,
          reviews,
        }),
      },
    ],
  };
}
