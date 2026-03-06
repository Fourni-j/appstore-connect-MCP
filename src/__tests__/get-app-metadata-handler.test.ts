import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/apps.js", () => ({
  getAppMetadata: vi.fn(),
}));

import { handleGetAppMetadata } from "../tools/get-app-metadata.js";
import { getAppMetadata } from "../api/apps.js";

const mockGetAppMetadata = getAppMetadata as ReturnType<typeof vi.fn>;

describe("handleGetAppMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns summary with app name, bundle ID, and locale count", async () => {
    mockGetAppMetadata.mockResolvedValue({
      appId: "123",
      name: "My App",
      bundleId: "com.example.myapp",
      localizations: [
        { locale: "en-US", name: "My App", subtitle: "Great app", keywords: "test", description: "desc", promotionalText: null },
        { locale: "fr-FR", name: "Mon App", subtitle: null, keywords: "test", description: "desc", promotionalText: null },
      ],
    });

    const result = await handleGetAppMetadata({ appId: "123" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary).toContain('"My App"');
    expect(parsed.summary).toContain("com.example.myapp");
    expect(parsed.summary).toContain("2 locales");
    expect(parsed.summary).toContain("en-US, fr-FR");
    expect(parsed.appId).toBe("123");
    expect(parsed.name).toBe("My App");
    expect(parsed.localizations).toHaveLength(2);
  });

  it("uses singular 'locale' for single localization", async () => {
    mockGetAppMetadata.mockResolvedValue({
      appId: "456",
      name: "Solo App",
      bundleId: "com.example.solo",
      localizations: [
        { locale: "en-US", name: "Solo App", subtitle: null, keywords: null, description: null, promotionalText: null },
      ],
    });

    const result = await handleGetAppMetadata({ appId: "456" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.summary).toContain("1 locale:");
    expect(parsed.summary).not.toContain("1 locales");
  });

  it("spreads full metadata into response", async () => {
    const metadata = {
      appId: "789",
      name: "Full App",
      bundleId: "com.example.full",
      localizations: [
        { locale: "en-US", name: "Full App", subtitle: "Sub", keywords: "kw", description: "desc", promotionalText: "promo" },
      ],
    };
    mockGetAppMetadata.mockResolvedValue(metadata);

    const result = await handleGetAppMetadata({ appId: "789" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.bundleId).toBe("com.example.full");
    expect(parsed.localizations[0].promotionalText).toBe("promo");
  });

  it("passes appId to getAppMetadata API", async () => {
    mockGetAppMetadata.mockResolvedValue({
      appId: "123",
      name: "Test",
      bundleId: "com.test",
      localizations: [],
    });

    await handleGetAppMetadata({ appId: "123" });

    expect(mockGetAppMetadata).toHaveBeenCalledWith("123");
  });
});
