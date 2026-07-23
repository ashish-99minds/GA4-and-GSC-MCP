import { getAccessToken, SCOPES } from "./auth-google.mts";

const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

async function ga4Fetch(url: string, options: RequestInit, scope: string) {
  const token = await getAccessToken([scope]);
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GA4 API error (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

function normalizeProperty(propertyId: string) {
  // Accept either "123456789" or "properties/123456789".
  return propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;
}

export async function runReport(args: any) {
  const { property_id, start_date, end_date, dimensions = [], metrics, limit = 100, dimension_filter } = args;
  if (!property_id || !start_date || !end_date || !metrics?.length) {
    throw new Error("property_id, start_date, end_date, and metrics are required");
  }
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: start_date, endDate: end_date }],
    dimensions: dimensions.map((name: string) => ({ name })),
    metrics: metrics.map((name: string) => ({ name })),
    limit: String(limit),
  };
  if (dimension_filter) body.dimensionFilter = dimension_filter;

  return ga4Fetch(
    `${DATA_API}/${normalizeProperty(property_id)}:runReport`,
    { method: "POST", body: JSON.stringify(body) },
    SCOPES.analyticsReadonly
  );
}

export async function runRealtimeReport(args: any) {
  const { property_id, dimensions = [], metrics } = args;
  if (!property_id || !metrics?.length) {
    throw new Error("property_id and metrics are required");
  }
  const body = {
    dimensions: dimensions.map((name: string) => ({ name })),
    metrics: metrics.map((name: string) => ({ name })),
  };
  return ga4Fetch(
    `${DATA_API}/${normalizeProperty(property_id)}:runRealtimeReport`,
    { method: "POST", body: JSON.stringify(body) },
    SCOPES.analyticsReadonly
  );
}

export async function listConversionEvents(args: any) {
  const { property_id } = args;
  if (!property_id) throw new Error("property_id is required");
  return ga4Fetch(
    `${ADMIN_API}/${normalizeProperty(property_id)}/conversionEvents`,
    { method: "GET" },
    SCOPES.analyticsReadonly
  );
}

export async function createConversionEvent(args: any) {
  const { property_id, event_name } = args;
  if (!property_id || !event_name) throw new Error("property_id and event_name are required");
  return ga4Fetch(
    `${ADMIN_API}/${normalizeProperty(property_id)}/conversionEvents`,
    { method: "POST", body: JSON.stringify({ eventName: event_name }) },
    SCOPES.analyticsEdit
  );
}
