import * as ga4 from "./ga4.mts";
import * as gsc from "./gsc.mts";

export function listTools() {
  return [
    {
      name: "ga4_run_report",
      description:
        "Run a custom Google Analytics 4 report using the GA4 Data API. Use standard GA4 dimension and metric names, e.g. dimensions ['date','sessionSource','sessionMedium'], metrics ['sessions','conversions','totalUsers'].",
      inputSchema: {
        type: "object",
        properties: {
          property_id: { type: "string", description: "GA4 property ID, e.g. '123456789'" },
          start_date: { type: "string", description: "YYYY-MM-DD or relative, e.g. '28daysAgo'" },
          end_date: { type: "string", description: "YYYY-MM-DD or relative, e.g. 'today'" },
          dimensions: { type: "array", items: { type: "string" }, description: "GA4 dimension names" },
          metrics: { type: "array", items: { type: "string" }, description: "GA4 metric names" },
          limit: { type: "number", description: "Max rows to return, default 100" },
          dimension_filter: {
            type: "object",
            description: "Optional GA4 FilterExpression object to restrict rows",
          },
        },
        required: ["property_id", "start_date", "end_date", "metrics"],
      },
    },
    {
      name: "ga4_run_realtime_report",
      description: "Run a GA4 realtime report to see activity happening right now (last ~30 minutes).",
      inputSchema: {
        type: "object",
        properties: {
          property_id: { type: "string", description: "GA4 property ID" },
          dimensions: { type: "array", items: { type: "string" } },
          metrics: { type: "array", items: { type: "string" } },
        },
        required: ["property_id", "metrics"],
      },
    },
    {
      name: "ga4_list_conversion_events",
      description: "List the events currently marked as conversions in a GA4 property.",
      inputSchema: {
        type: "object",
        properties: {
          property_id: { type: "string", description: "GA4 property ID" },
        },
        required: ["property_id"],
      },
    },
    {
      name: "ga4_create_conversion_event",
      description: "Mark an existing GA4 event as a conversion event. Write action.",
      inputSchema: {
        type: "object",
        properties: {
          property_id: { type: "string", description: "GA4 property ID" },
          event_name: { type: "string", description: "The exact GA4 event name to mark as a conversion" },
        },
        required: ["property_id", "event_name"],
      },
    },
    {
      name: "gsc_list_sites",
      description: "List all Search Console properties the connected service account has access to.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "gsc_query_search_analytics",
      description:
        "Query Search Console performance data (clicks, impressions, CTR, position) grouped by query, page, country, device, or date.",
      inputSchema: {
        type: "object",
        properties: {
          site_url: { type: "string", description: "Property as registered in Search Console, e.g. 'https://example.com/' or 'sc-domain:example.com'" },
          start_date: { type: "string", description: "YYYY-MM-DD" },
          end_date: { type: "string", description: "YYYY-MM-DD" },
          dimensions: {
            type: "array",
            items: { type: "string", enum: ["query", "page", "country", "device", "date", "searchAppearance"] },
            description: "Defaults to ['query']",
          },
          row_limit: { type: "number", description: "Max rows, default 100, max 25000" },
        },
        required: ["site_url", "start_date", "end_date"],
      },
    },
    {
      name: "gsc_list_sitemaps",
      description: "List submitted sitemaps for a Search Console property.",
      inputSchema: {
        type: "object",
        properties: {
          site_url: { type: "string", description: "Property as registered in Search Console" },
        },
        required: ["site_url"],
      },
    },
    {
      name: "gsc_submit_sitemap",
      description: "Submit a sitemap to Search Console for a property. Write action.",
      inputSchema: {
        type: "object",
        properties: {
          site_url: { type: "string", description: "Property as registered in Search Console" },
          feedpath: { type: "string", description: "Full sitemap URL, e.g. 'https://example.com/sitemap.xml'" },
        },
        required: ["site_url", "feedpath"],
      },
    },
    {
      name: "gsc_delete_sitemap",
      description: "Remove a submitted sitemap from a Search Console property. Write action.",
      inputSchema: {
        type: "object",
        properties: {
          site_url: { type: "string", description: "Property as registered in Search Console" },
          feedpath: { type: "string", description: "Full sitemap URL to remove" },
        },
        required: ["site_url", "feedpath"],
      },
    },
    {
      name: "gsc_inspect_url",
      description: "Run the URL Inspection API to check indexing status, mobile usability, and rich result eligibility for a single URL.",
      inputSchema: {
        type: "object",
        properties: {
          site_url: { type: "string", description: "Property as registered in Search Console" },
          inspection_url: { type: "string", description: "The full URL to inspect" },
        },
        required: ["site_url", "inspection_url"],
      },
    },
  ];
}

export async function callTool(name: string, args: any) {
  switch (name) {
    case "ga4_run_report":
      return ga4.runReport(args);
    case "ga4_run_realtime_report":
      return ga4.runRealtimeReport(args);
    case "ga4_list_conversion_events":
      return ga4.listConversionEvents(args);
    case "ga4_create_conversion_event":
      return ga4.createConversionEvent(args);
    case "gsc_list_sites":
      return gsc.listSites();
    case "gsc_query_search_analytics":
      return gsc.querySearchAnalytics(args);
    case "gsc_list_sitemaps":
      return gsc.listSitemaps(args);
    case "gsc_submit_sitemap":
      return gsc.submitSitemap(args);
    case "gsc_delete_sitemap":
      return gsc.deleteSitemap(args);
    case "gsc_inspect_url":
      return gsc.inspectUrl(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
