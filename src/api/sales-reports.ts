import { apiRequest } from "./client.js";
import { gunzipToString } from "../utils/compression.js";
import { parseTSV } from "../utils/tsv.js";

export interface SalesReportParams {
  vendorNumber: string;
  reportType: string;
  reportSubType: string;
  frequency: string;
  reportDate?: string;
}

export async function getSalesReport(
  params: SalesReportParams
): Promise<Record<string, string>[]> {
  const queryParams: Record<string, string> = {
    "filter[vendorNumber]": params.vendorNumber,
    "filter[reportType]": params.reportType,
    "filter[reportSubType]": params.reportSubType,
    "filter[frequency]": params.frequency,
  };

  if (params.reportDate) {
    queryParams["filter[reportDate]"] = params.reportDate;
  }

  const response = await apiRequest("/v1/salesReports", {
    params: queryParams,
    rawResponse: true,
    accept: "application/a-gzip",
  });

  const arrayBuffer = await (response as Response).arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Sales reports come back gzipped
  let tsvContent: string;
  try {
    tsvContent = gunzipToString(buffer);
  } catch {
    // Maybe not gzipped (some endpoints return plain text)
    tsvContent = buffer.toString("utf8");
  }

  return parseTSV(tsvContent);
}
