import { z } from "zod";
import { listApps } from "../api/apps.js";

export const listAppsSchema = z.object({
  limit: z.number().min(1).max(200).default(50).describe("Max number of apps to return"),
});

export type ListAppsInput = z.infer<typeof listAppsSchema>;

export async function handleListApps(input: ListAppsInput) {
  const apps = await listApps(input.limit);

  const summary = apps.length === 0
    ? "No apps found in this App Store Connect account."
    : `Found ${apps.length} app${apps.length > 1 ? "s" : ""}. Use an app's "id" as the "appId" parameter in other tools (get_app_metadata, get_app_store_versions, get_downloads_summary, get_analytics_report).`;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ summary, apps }),
      },
    ],
  };
}
