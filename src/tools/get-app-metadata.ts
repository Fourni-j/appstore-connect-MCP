import { z } from "zod";
import { getAppMetadata } from "../api/apps.js";

export const getAppMetadataSchema = z.object({
  appId: z.string().describe("App Store Connect app ID (from list_apps)"),
});

export type GetAppMetadataInput = z.infer<typeof getAppMetadataSchema>;

export async function handleGetAppMetadata(input: GetAppMetadataInput) {
  const metadata = await getAppMetadata(input.appId);

  const localeCount = metadata.localizations.length;
  const locales = metadata.localizations.map((l) => l.locale).join(", ");
  const summary = `Metadata for "${metadata.name}" (${metadata.bundleId}) with ${localeCount} locale${localeCount !== 1 ? "s" : ""}: ${locales}.`;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ summary, ...metadata }),
      },
    ],
  };
}
