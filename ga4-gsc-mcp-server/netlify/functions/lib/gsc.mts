import { getAccessToken, SCOPES } from "./auth-google.mts";

const BASE = "https://www.googleapis.com/webmasters/v3";
const INSPECTION_API = "https://searchconsole.googleapis.com/v1";

async function gscFetch(url: string, options: RequestInit = {}) {
  const token = await getAccessToken([SCOPES.webmasters]);
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (res.status === 204) return { success: true };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Search Console API error (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

export async function listSites() {
  return gscFetch(`${BASE}/sites`);
}

export async function listSitemaps(args: any) {
  const { site_url } = args;
  if (!site_url) throw new Error("site_url is required");
  return gscFetch(`${BASE}/sites/${encodeURIComponent(site_url)}/sitemaps`);
}

export async function submitSitemap(args: any) {
  const { site_url, feedpath } = args;
  if (!site_url || !feedpath) throw new Error("site_url and feedpath are required");
  return gscFetch(
    `${BASE}/sites/${encodeURIComponent(site_url)}/sitemaps/${encodeURIComponent(feedpath)}`,
    { method: "PUT" }
  );
}

export async function deleteSitemap(args: any) {
  const { site_url, feedpath } = args;
  if (!site_url || !feedpath) throw new Error("site_url and feedpath are required");
  return gscFetch(
    `${BASE}/sites/${encodeURIComponent(site_url)}/sitemaps/${encodeURIComponent(feedpath)}`,
    { method: "DELETE" }
  );
}

export async function querySearchAnalytics(args: any) {
  const { site_url, start_date, end_date, dimensions = ["query"], row_limit = 100 } = args;
  if (!site_url || !start_date || !end_date) {
    throw new Error("site_url, start_date, and end_date are required");
  }
  return gscFetch(`${BASE}/sites/${encodeURIComponent(site_url)}/searchAnalytics/query`, {
    method: "POST",
    body: JSON.stringify({
      startDate: start_date,
      endDate: end_date,
      dimensions,
      rowLimit: row_limit,
    }),
  });
}

export async function inspectUrl(args: any) {
  const { site_url, inspection_url } = args;
  if (!site_url || !inspection_url) throw new Error("site_url and inspection_url are required");
  return gscFetch(`${INSPECTION_API}/urlInspection/index:inspect`, {
    method: "POST",
    body: JSON.stringify({ inspectionUrl: inspection_url, siteUrl: site_url }),
  });
}
