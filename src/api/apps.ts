import { apiRequest } from "./client.js";

// In-memory cache for app list
let appListCache: any[] | null = null;
let appListCachedAt = 0;
const APP_LIST_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface AppInfo {
  id: string;
  bundleId: string;
  name: string;
  sku: string;
}

export async function listApps(limit: number = 50): Promise<AppInfo[]> {
  const now = Date.now();
  if (appListCache && now - appListCachedAt < APP_LIST_CACHE_TTL_MS) {
    return appListCache.slice(0, limit);
  }

  const data = await apiRequest("/v1/apps", {
    params: { "fields[apps]": "bundleId,name,sku", limit: String(limit) },
  });

  const apps: AppInfo[] = data.data.map((app: any) => ({
    id: app.id,
    bundleId: app.attributes.bundleId,
    name: app.attributes.name,
    sku: app.attributes.sku,
  }));

  appListCache = apps;
  appListCachedAt = now;
  return apps;
}

export interface AppLocalization {
  locale: string;
  name: string;
  subtitle: string | null;
  keywords: string | null;
  description: string | null;
  promotionalText: string | null;
}

export interface AppMetadata {
  appId: string;
  name: string;
  bundleId: string;
  localizations: AppLocalization[];
}

export async function getAppMetadata(appId: string): Promise<AppMetadata> {
  // Get the app info
  const appData = await apiRequest(`/v1/apps/${appId}`, {
    params: { "fields[apps]": "bundleId,name" },
  });

  const app = appData.data;

  // Get app store versions with localizations included
  const versionsData = await apiRequest(
    `/v1/apps/${appId}/appStoreVersions`,
    {
      params: {
        "filter[appStoreState]": "READY_FOR_SALE,PREPARE_FOR_SUBMISSION,IN_REVIEW,WAITING_FOR_REVIEW,PENDING_DEVELOPER_RELEASE",
        "include": "appStoreVersionLocalizations",
        "fields[appStoreVersionLocalizations]": "locale,description,keywords,promotionalText",
        limit: "1",
      },
    }
  );

  // Get app info localizations (for name and subtitle)
  const appInfosData = await apiRequest(`/v1/apps/${appId}/appInfos`, {
    params: {
      include: "appInfoLocalizations",
      "fields[appInfoLocalizations]": "locale,name,subtitle",
      limit: "1",
    },
  });

  // Merge localizations from both sources
  const localeMap = new Map<string, AppLocalization>();

  // Process app info localizations (name, subtitle)
  const appInfoLocalizations = appInfosData.included || [];
  for (const loc of appInfoLocalizations) {
    if (loc.type !== "appInfoLocalizations") continue;
    const locale = loc.attributes.locale;
    localeMap.set(locale, {
      locale,
      name: loc.attributes.name ?? "",
      subtitle: loc.attributes.subtitle ?? null,
      keywords: null,
      description: null,
      promotionalText: null,
    });
  }

  // Process version localizations (keywords, description, promotionalText)
  const versionLocalizations = versionsData.included || [];
  for (const loc of versionLocalizations) {
    if (loc.type !== "appStoreVersionLocalizations") continue;
    const locale = loc.attributes.locale;
    const existing = localeMap.get(locale) || {
      locale,
      name: "",
      subtitle: null,
      keywords: null,
      description: null,
      promotionalText: null,
    };
    existing.keywords = loc.attributes.keywords ?? null;
    existing.description = loc.attributes.description ?? null;
    existing.promotionalText = loc.attributes.promotionalText ?? null;
    localeMap.set(locale, existing);
  }

  return {
    appId,
    name: app.attributes.name,
    bundleId: app.attributes.bundleId,
    localizations: Array.from(localeMap.values()),
  };
}

export interface AppVersion {
  versionString: string;
  appStoreState: string;
  createdDate: string;
  platform: string;
}

export async function getAppStoreVersions(
  appId: string,
  limit: number = 10
): Promise<AppVersion[]> {
  const data = await apiRequest(`/v1/apps/${appId}/appStoreVersions`, {
    params: {
      "fields[appStoreVersions]": "versionString,appStoreState,createdDate,platform",
      limit: String(limit),
    },
  });

  return data.data.map((v: any) => ({
    versionString: v.attributes.versionString,
    appStoreState: v.attributes.appStoreState,
    createdDate: v.attributes.createdDate,
    platform: v.attributes.platform,
  }));
}
