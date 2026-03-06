import { z } from "zod";
import { getAppStoreVersions } from "../api/apps.js";

export const getAppStoreVersionsSchema = z.object({
  appId: z.string().describe("App Store Connect app ID (from list_apps)"),
  limit: z.number().min(1).max(50).default(10).describe("Max number of versions to return"),
});

export type GetAppStoreVersionsInput = z.infer<typeof getAppStoreVersionsSchema>;

export async function handleGetAppStoreVersions(input: GetAppStoreVersionsInput) {
  const versions = await getAppStoreVersions(input.appId, input.limit);

  const summary = versions.length === 0
    ? "No versions found for this app."
    : `Found ${versions.length} version${versions.length > 1 ? "s" : ""}. Latest: ${versions[0].versionString} (${versions[0].appStoreState}, ${versions[0].platform}).`;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ summary, versions }),
      },
    ],
  };
}
