import { getToken } from "../auth.js";
import { apiRequest, fetchUrl } from "./client.js";
import { gunzipToString } from "../utils/compression.js";
import { parseTSV } from "../utils/tsv.js";

// Cache for report request IDs per app (avoids needing GET_COLLECTION)
const reportRequestIdCache = new Map<string, string>();

// Cache for downloaded report segments (1 hour)
const segmentCache = new Map<string, { data: Record<string, string>[]; cachedAt: number }>();
const SEGMENT_CACHE_TTL_MS = 60 * 60 * 1000;

export type AnalyticsCategory =
  | "APP_STORE_ENGAGEMENT"
  | "COMMERCE"
  | "APP_USAGE"
  | "FRAMEWORK_USAGE"
  | "PERFORMANCE";

export interface AnalyticsParams {
  appId: string;
  category: AnalyticsCategory;
  granularity?: "DAILY" | "WEEKLY" | "MONTHLY";
  startDate?: string;
  endDate?: string;
}

/**
 * Full async analytics flow:
 * 1. Find or create a report request for this app
 * 2. Get reports under that request
 * 3. Get instances for the matching report
 * 4. Download segments
 * 5. Parse and return data
 */
export async function getAnalyticsReport(
  params: AnalyticsParams
): Promise<{ status: "ready"; data: Record<string, string>[] } | { status: "pending"; message: string }> {
  // Step 1: Find or create an ONGOING report request for this app.
  // GET_COLLECTION is forbidden on analyticsReportRequests, so we use
  // POST-to-create and cache the ID for subsequent calls.
  let reportRequestId: string | undefined = reportRequestIdCache.get(params.appId);

  if (!reportRequestId) {
    const token = getToken();
    const createResponse = await fetch(
      "https://api.appstoreconnect.apple.com/v1/analyticsReportRequests",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          data: {
            type: "analyticsReportRequests",
            attributes: {
              accessType: "ONGOING",
            },
            relationships: {
              app: {
                data: { type: "apps", id: params.appId },
              },
            },
          },
        }),
      }
    );

    if (createResponse.status === 201) {
      // Newly created — cache the ID, but reports won't be ready yet
      const created = await createResponse.json();
      reportRequestId = created.data.id as string;
      reportRequestIdCache.set(params.appId, reportRequestId);
      return {
        status: "pending",
        message:
          "Created a new analytics report request. Apple needs time to generate reports. Please retry in a few hours.",
      };
    } else if (createResponse.status === 409) {
      // Conflict — an ONGOING request already exists.
      // Apple doesn't return the existing ID in the 409 body,
      // so list report requests via the app relationship endpoint.
      const requestsData = await apiRequest(
        `/v1/apps/${params.appId}/analyticsReportRequests`,
        { params: { limit: "10" } }
      );
      const activeReq = requestsData.data?.find(
        (req: any) => !req.attributes.stoppedDueToInactivity
      );
      if (!activeReq) {
        throw new Error("Could not find an active analytics report request.");
      }
      reportRequestId = activeReq.id;

      reportRequestIdCache.set(params.appId, reportRequestId!);
    } else {
      const body = await createResponse.text();
      throw new Error(
        `Failed to create analytics report request (${createResponse.status}): ${body}`
      );
    }
  }

  // Step 2: Get reports for this request
  const reportsData = await apiRequest(
    `/v1/analyticsReportRequests/${reportRequestId}/reports`,
    {
      params: {
        "filter[category]": params.category,
        limit: "50",
      },
    }
  );

  if (!reportsData.data || reportsData.data.length === 0) {
    return {
      status: "pending",
      message: `No reports available yet for category ${params.category}. Reports may still be generating.`,
    };
  }

  // Find the best matching report based on name/category
  const report = reportsData.data[0];
  const reportId = report.id;

  // Step 3: Get report instances
  const instancesParams: Record<string, string> = { limit: "50" };
  if (params.granularity) {
    instancesParams["filter[granularity]"] = params.granularity;
  }

  const instancesData = await apiRequest(
    `/v1/analyticsReports/${reportId}/instances`,
    { params: instancesParams }
  );

  if (!instancesData.data || instancesData.data.length === 0) {
    return {
      status: "pending",
      message: "No report instances available yet. Reports may still be generating.",
    };
  }

  // Filter instances by date range if specified
  let instances = instancesData.data;
  if (params.startDate || params.endDate) {
    instances = instances.filter((inst: any) => {
      const processingDate = inst.attributes.processingDate;
      if (params.startDate && processingDate < params.startDate) return false;
      if (params.endDate && processingDate > params.endDate) return false;
      return true;
    });
  }

  if (instances.length === 0) {
    return {
      status: "pending",
      message: "No report instances match the specified date range.",
    };
  }

  // Step 4: Download segments for each instance
  const allRows: Record<string, string>[] = [];

  for (const instance of instances) {
    const instanceId = instance.id;

    // Check cache
    const cached = segmentCache.get(instanceId);
    if (cached && Date.now() - cached.cachedAt < SEGMENT_CACHE_TTL_MS) {
      allRows.push(...cached.data);
      continue;
    }

    // Get segments for this instance
    const segmentsData = await apiRequest(
      `/v1/analyticsReportInstances/${instanceId}/segments`,
      { params: { limit: "50" } }
    );

    const instanceRows: Record<string, string>[] = [];

    for (const segment of segmentsData.data || []) {
      const downloadUrl = segment.attributes.url;
      if (!downloadUrl) continue;

      const response = await fetchUrl(downloadUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let content: string;
      try {
        content = gunzipToString(buffer);
      } catch {
        content = buffer.toString("utf8");
      }

      const rows = parseTSV(content);
      instanceRows.push(...rows);
    }

    // Cache this instance's data
    segmentCache.set(instanceId, { data: instanceRows, cachedAt: Date.now() });
    allRows.push(...instanceRows);
  }

  return { status: "ready", data: allRows };
}
