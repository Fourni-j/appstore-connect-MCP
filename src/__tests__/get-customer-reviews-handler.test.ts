import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/reviews.js", () => ({
  getCustomerReviews: vi.fn(),
  getAppStoreRating: vi.fn(),
}));

import { handleGetCustomerReviews } from "../tools/get-customer-reviews.js";
import { getCustomerReviews, getAppStoreRating } from "../api/reviews.js";

const mockGetCustomerReviews = getCustomerReviews as ReturnType<typeof vi.fn>;
const mockGetAppStoreRating = getAppStoreRating as ReturnType<typeof vi.fn>;

function makeReview(overrides: Partial<{
  id: string;
  rating: number;
  title: string;
  body: string;
  reviewerNickname: string;
  territory: string;
  createdDate: string;
}> = {}) {
  return {
    id: overrides.id ?? "1",
    rating: overrides.rating ?? 5,
    title: overrides.title ?? "Great",
    body: overrides.body ?? "Love it",
    reviewerNickname: overrides.reviewerNickname ?? "user1",
    territory: overrides.territory ?? "USA",
    createdDate: overrides.createdDate ?? "2026-03-01T00:00:00Z",
  };
}

describe("handleGetCustomerReviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAppStoreRating.mockResolvedValue(null);
  });

  it("returns summary with review count and average rating", async () => {
    mockGetCustomerReviews.mockResolvedValue({
      reviews: [
        makeReview({ rating: 5 }),
        makeReview({ id: "2", rating: 3 }),
      ],
      totalFetched: 2,
    });

    const result = await handleGetCustomerReviews({ appId: "123" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.summary).toContain("2 written reviews");
    expect(parsed.summary).toContain("avg 4.00");
    expect(parsed.totalReviews).toBe(2);
    expect(parsed.averageRating).toBe(4);
  });

  it("computes correct rating distribution", async () => {
    mockGetCustomerReviews.mockResolvedValue({
      reviews: [
        makeReview({ rating: 5 }),
        makeReview({ id: "2", rating: 5 }),
        makeReview({ id: "3", rating: 4 }),
        makeReview({ id: "4", rating: 1 }),
      ],
      totalFetched: 4,
    });

    const result = await handleGetCustomerReviews({ appId: "123" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.ratingDistribution).toEqual({
      "1": 1,
      "2": 0,
      "3": 0,
      "4": 1,
      "5": 2,
    });
  });

  it("computes correct average rating", async () => {
    mockGetCustomerReviews.mockResolvedValue({
      reviews: [
        makeReview({ rating: 4 }),
        makeReview({ id: "2", rating: 5 }),
        makeReview({ id: "3", rating: 3 }),
      ],
      totalFetched: 3,
    });

    const result = await handleGetCustomerReviews({ appId: "123" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.averageRating).toBe(4);
  });

  it("returns null average and zero distribution when no reviews", async () => {
    mockGetCustomerReviews.mockResolvedValue({
      reviews: [],
      totalFetched: 0,
    });

    const result = await handleGetCustomerReviews({ appId: "123" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.averageRating).toBeNull();
    expect(parsed.totalReviews).toBe(0);
    expect(parsed.ratingDistribution).toEqual({
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
    });
  });

  it("truncates at 500 reviews but aggregates full set", async () => {
    const reviews = Array.from({ length: 600 }, (_, i) =>
      makeReview({ id: String(i), rating: (i % 5) + 1 })
    );
    mockGetCustomerReviews.mockResolvedValue({
      reviews,
      totalFetched: 600,
    });

    const result = await handleGetCustomerReviews({ appId: "123", limit: 1000 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.truncated).toBe(true);
    expect(parsed.reviews).toHaveLength(500);
    expect(parsed.totalReviews).toBe(600);
    // Distribution should reflect all 600, not just 500
    const totalInDist = Object.values(parsed.ratingDistribution as Record<string, number>).reduce(
      (a, b) => a + b,
      0
    );
    expect(totalInDist).toBe(600);
  });

  it("applies client-side date filtering", async () => {
    mockGetCustomerReviews.mockResolvedValue({
      reviews: [
        makeReview({ id: "1", createdDate: "2026-03-05T00:00:00Z" }),
        makeReview({ id: "2", createdDate: "2026-03-03T00:00:00Z" }),
        makeReview({ id: "3", createdDate: "2026-02-28T00:00:00Z" }),
        makeReview({ id: "4", createdDate: "2026-02-25T00:00:00Z" }),
      ],
      totalFetched: 4,
    });

    const result = await handleGetCustomerReviews({
      appId: "123",
      startDate: "2026-03-01",
      endDate: "2026-03-04",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.totalReviews).toBe(1);
    expect(parsed.reviews[0].id).toBe("2");
  });

  it("passes rating, territory, sort, and limit to API layer", async () => {
    mockGetCustomerReviews.mockResolvedValue({
      reviews: [],
      totalFetched: 0,
    });

    await handleGetCustomerReviews({
      appId: "456",
      rating: 5,
      territory: "GBR",
      sort: "rating",
      limit: 100,
    });

    expect(mockGetCustomerReviews).toHaveBeenCalledWith("456", {
      rating: 5,
      territory: "GBR",
      sort: "rating",
      limit: 100,
    });
  });

  it("includes App Store rating in summary and response when available", async () => {
    mockGetCustomerReviews.mockResolvedValue({
      reviews: [makeReview({ rating: 5 })],
      totalFetched: 1,
    });
    mockGetAppStoreRating.mockResolvedValue({
      averageRating: 4.58,
      ratingCount: 178,
      currentVersionAverageRating: 4.58,
      currentVersionRatingCount: 178,
    });

    const result = await handleGetCustomerReviews({ appId: "123" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.summary).toContain("App Store rating (US): 4.58 from 178 ratings");
    expect(parsed.storeRating.averageRating).toBe(4.58);
    expect(parsed.storeRating.ratingCount).toBe(178);
  });

  it("omits storeRating when lookup returns null", async () => {
    mockGetCustomerReviews.mockResolvedValue({
      reviews: [makeReview({ rating: 5 })],
      totalFetched: 1,
    });
    mockGetAppStoreRating.mockResolvedValue(null);

    const result = await handleGetCustomerReviews({ appId: "123" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.storeRating).toBeUndefined();
    expect(parsed.summary).not.toContain("App Store rating");
  });

  it("early-stops date filtering when sorted by -createdDate", async () => {
    mockGetCustomerReviews.mockResolvedValue({
      reviews: [
        makeReview({ id: "1", createdDate: "2026-03-05T00:00:00Z" }),
        makeReview({ id: "2", createdDate: "2026-03-03T00:00:00Z" }),
        makeReview({ id: "3", createdDate: "2026-02-28T00:00:00Z" }),
        makeReview({ id: "4", createdDate: "2026-02-20T00:00:00Z" }),
      ],
      totalFetched: 4,
    });

    const result = await handleGetCustomerReviews({
      appId: "123",
      sort: "-createdDate",
      startDate: "2026-03-01",
    });
    const parsed = JSON.parse(result.content[0].text);

    // Should include only the two March reviews (early stop at Feb 28)
    expect(parsed.totalReviews).toBe(2);
  });
});
