import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/apps.js", () => ({
  listApps: vi.fn(),
}));

import { handleListApps } from "../tools/list-apps.js";
import { listApps } from "../api/apps.js";

const mockListApps = listApps as ReturnType<typeof vi.fn>;

describe("handleListApps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns summary and apps array when apps exist", async () => {
    const apps = [
      { id: "123", bundleId: "com.example.app1", name: "App One", sku: "SKU1" },
      { id: "456", bundleId: "com.example.app2", name: "App Two", sku: "SKU2" },
    ];
    mockListApps.mockResolvedValue(apps);

    const result = await handleListApps({ limit: 50 });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary).toContain("Found 2 apps");
    expect(parsed.summary).toContain("appId");
    expect(parsed.apps).toEqual(apps);
  });

  it("returns singular 'app' for a single app", async () => {
    const apps = [
      { id: "123", bundleId: "com.example.app1", name: "App One", sku: "SKU1" },
    ];
    mockListApps.mockResolvedValue(apps);

    const result = await handleListApps({ limit: 50 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.summary).toContain("Found 1 app.");
    expect(parsed.summary).not.toContain("1 apps");
    expect(parsed.apps).toHaveLength(1);
  });

  it("returns empty message when no apps found", async () => {
    mockListApps.mockResolvedValue([]);

    const result = await handleListApps({ limit: 50 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.summary).toBe("No apps found in this App Store Connect account.");
    expect(parsed.apps).toEqual([]);
  });

  it("passes limit to listApps API", async () => {
    mockListApps.mockResolvedValue([]);

    await handleListApps({ limit: 10 });

    expect(mockListApps).toHaveBeenCalledWith(10);
  });
});
