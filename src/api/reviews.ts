import { apiRequest } from "./client.js";

export interface AppStoreRating {
  averageRating: number;
  ratingCount: number;
  currentVersionAverageRating: number;
  currentVersionRatingCount: number;
}

export async function getAppStoreRating(
  appId: string,
  country: string = "US"
): Promise<AppStoreRating | null> {
  try {
    const response = await fetch(
      `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=${encodeURIComponent(country)}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const result = data.results?.[0];
    if (!result) return null;
    return {
      averageRating: result.averageUserRating ?? null,
      ratingCount: result.userRatingCount ?? null,
      currentVersionAverageRating:
        result.averageUserRatingForCurrentVersion ?? null,
      currentVersionRatingCount:
        result.userRatingCountForCurrentVersion ?? null,
    };
  } catch {
    return null;
  }
}

export interface CustomerReview {
  id: string;
  rating: number;
  title: string;
  body: string;
  reviewerNickname: string;
  territory: string;
  createdDate: string;
}

export interface GetCustomerReviewsOptions {
  rating?: number;
  territory?: string;
  sort?: string;
  limit?: number;
}

export async function getCustomerReviews(
  appId: string,
  options: GetCustomerReviewsOptions = {}
): Promise<{ reviews: CustomerReview[]; totalFetched: number }> {
  const limit = options.limit ?? 500;
  const perPage = Math.min(limit, 200);

  const params: Record<string, string> = {
    "fields[customerReviews]":
      "rating,title,body,reviewerNickname,territory,createdDate",
    limit: String(perPage),
  };
  if (options.rating !== undefined) {
    params["filter[rating]"] = String(options.rating);
  }
  if (options.territory) {
    params["filter[territory]"] = options.territory;
  }
  if (options.sort) {
    params.sort = options.sort;
  }

  const reviews: CustomerReview[] = [];
  let nextPath: string | null = `/v1/apps/${appId}/customerReviews`;
  let isFirstRequest = true;

  while (nextPath && reviews.length < limit) {
    const data: any = isFirstRequest
      ? await apiRequest(nextPath, { params })
      : await apiRequest(nextPath);

    isFirstRequest = false;

    for (const item of data.data ?? []) {
      if (reviews.length >= limit) break;
      reviews.push({
        id: item.id,
        rating: item.attributes.rating,
        title: item.attributes.title ?? "",
        body: item.attributes.body ?? "",
        reviewerNickname: item.attributes.reviewerNickname ?? "",
        territory: item.attributes.territory ?? "",
        createdDate: item.attributes.createdDate ?? "",
      });
    }

    const nextUrl: string | undefined = data.links?.next;
    if (nextUrl && reviews.length < limit) {
      const parsed: URL = new URL(nextUrl);
      nextPath = parsed.pathname + parsed.search;
    } else {
      nextPath = null;
    }
  }

  return { reviews, totalFetched: reviews.length };
}
