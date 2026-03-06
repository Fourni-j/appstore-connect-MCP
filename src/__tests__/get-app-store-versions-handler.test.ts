import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/apps.js", () => ({
  getAppStoreVersions: vi.fn(),
}));

import { handleGetAppStoreVersions } from "../tools/get-app-store-versions.js";
import { getAppStoreVersions } from "../api/apps.js";

const mockGetAppStoreVersions = getAppStoreVersions as ReturnType<typeof vi.fn>;

describe("handleGetAppStoreVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns summary highlighting latest version", async () => {
    const versions = [
      { versionString: "2.1.0", appStoreState: "READY_FOR_SALE", createdDate: "2025-12-01", platform: "IOS" },
      { versionString: "2.0.0", appStoreState: "READY_FOR_SALE", createdDate: "2025-10-01", platform: "IOS" },
    ];
    mockGetAppStoreVersions.mockResolvedValue(versions);

    const result = await handleGetAppStoreVersions({ appId: "123", limit: 10 });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary).toContain("Found 2 versions");
    expect(parsed.summary).toContain("Latest: 2.1.0");
    expect(parsed.summary).toContain("READY_FOR_SALE");
    expect(parsed.summary).toContain("IOS");
    expect(parsed.versions).toEqual(versions);
  });

  it("uses singular 'version' for single result", async () => {
    const versions = [
      { versionString: "1.0.0", appStoreState: "IN_REVIEW", createdDate: "2025-11-01", platform: "IOS" },
    ];
    mockGetAppStoreVersions.mockResolvedValue(versions);

    const result = await handleGetAppStoreVersions({ appId: "123", limit: 10 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.summary).toContain("Found 1 version.");
    expect(parsed.summary).not.toContain("1 versions");
    expect(parsed.summary).toContain("Latest: 1.0.0");
  });

  it("returns empty message when no versions found", async () => {
    mockGetAppStoreVersions.mockResolvedValue([]);

    const result = await handleGetAppStoreVersions({ appId: "123", limit: 10 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.summary).toBe("No versions found for this app.");
    expect(parsed.versions).toEqual([]);
  });

  it("passes appId and limit to API", async () => {
    mockGetAppStoreVersions.mockResolvedValue([]);

    await handleGetAppStoreVersions({ appId: "abc", limit: 5 });

    expect(mockGetAppStoreVersions).toHaveBeenCalledWith("abc", 5);
  });
});
