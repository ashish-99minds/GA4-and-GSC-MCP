# GA4 + Search Console MCP Server

A remote MCP server that gives Claude direct access to Google Analytics 4 and
Google Search Console data, plus a couple of write actions. It runs as a
Netlify serverless function, so there is nothing to keep running on your own
machine.

## What it can do

**Google Analytics 4**
- `ga4_run_report`: any custom report (dimensions, metrics, date range, filters)
- `ga4_run_realtime_report`: what is happening on the site right now
- `ga4_list_conversion_events`: see which events are marked as conversions
- `ga4_create_conversion_event`: mark an event as a conversion (write action)

**Search Console**
- `gsc_list_sites`: properties the service account can see
- `gsc_query_search_analytics`: clicks, impressions, CTR, position by query, page, country, device, or date
- `gsc_list_sitemaps`: submitted sitemaps for a property
- `gsc_submit_sitemap`: submit a sitemap (write action)
- `gsc_delete_sitemap`: remove a sitemap (write action)
- `gsc_inspect_url`: indexing status and mobile usability for a single URL

Note on GA4 "annotations": GA4 does not expose a public write API for
annotations the way old Universal Analytics did, so that specific action
is not possible. Marking conversion events is the closest real write
capability GA4 offers, which is what `ga4_create_conversion_event` does.

## How auth works

There are two separate auth layers here, and it's worth keeping them straight:

**Google side:** the server authenticates to Google with a single service
account. You grant that service account read (and for GSC, write) access
inside GA4 and Search Console directly, the same way you'd add a colleague.
Nobody logs into Google through this server.

**Connector side:** this is what changed. Instead of a secret baked into the
URL, the server now implements a real OAuth 2.1 login (authorization code
flow with PKCE, plus dynamic client registration, per the MCP authorization
spec). When Claude connects, it:
1. Registers itself automatically against `/register` (no setup needed on your end)
2. Sends you to `/authorize`, which shows a small password-protected login page
3. On success, issues a short-lived access token and a longer-lived refresh
   token, so you're not asked to log in again for a while

The password on that login page (`MCP_LOGIN_PASSWORD`) is the thing you
control and should keep secret. Access tokens expire after an hour;
refresh tokens are valid for 90 days and rotate on every use (each refresh
invalidates the previous one). Client registrations, issued codes, and
refresh tokens are stored in Netlify Blobs, which is provisioned
automatically, there's nothing extra to configure.

This is a self-contained, single-tenant authorization server: it doesn't
verify against Google or any third party identity provider, it only checks
the one password you set. That's intentional and appropriate for a personal
or small-team internal tool. It is not meant to scale to per-user logins for
a large team, if you outgrow that, this is the piece you'd swap out.

## Setup

### 1. Google Cloud project and service account

1. Go to console.cloud.google.com and create a project (or use an existing one).
2. Enable these three APIs under "APIs & Services > Library":
   - Google Analytics Data API
   - Google Analytics Admin API
   - Search Console API (listed as "Google Search Console API")
3. Go to "APIs & Services > Credentials" and create a service account.
4. Open the service account, go to the "Keys" tab, and create a new JSON key.
   This downloads a `.json` file. Keep it safe, it is a credential.
5. Note the service account's email address, it looks like
   `something@your-project.iam.gserviceaccount.com`.

### 2. Grant access

**In GA4:** Admin > Property Access Management > add the service account
email with the "Viewer" role (Admin/Editor only needed if you want it to do
more than the write action included here).

**In Search Console:** Settings > Users and permissions > Add user > paste
the service account email and set permission to "Full" (Owner). Sitemap
submission and deletion require Owner-level access.

### 3. Deploy to Netlify

This project is a plain Node/Netlify Functions app, so any way you normally
deploy to Netlify works: connect a GitHub repo in the Netlify dashboard, or
use the Netlify CLI.

Using the CLI from this folder:
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

### 4. Set environment variables

In the Netlify dashboard under Site configuration > Environment variables,
add:
- `GOOGLE_SERVICE_ACCOUNT_KEY`: paste the full contents of the JSON key file
  from step 1, as one line
- `MCP_LOGIN_PASSWORD`: a long random password, this is what you'll type into
  the login screen the first time Claude connects
- `MCP_JWT_SECRET`: a long random string used to sign access tokens, generate
  one with `openssl rand -hex 32`

Redeploy after adding these so the function picks them up. Netlify Blobs
(used to store client registrations, auth codes, and refresh tokens) needs no
separate setup, it comes with the site automatically.

### 5. Your MCP endpoint

Your endpoint is:
```
https://YOUR-SITE-NAME.netlify.app/mcp
```

Open it directly and you will see a 401, that is expected, it means the auth
check is working. Claude will discover the login flow automatically from
this URL, you don't need to visit `/authorize` or `/register` yourself.

### 6. Connect it in Claude.ai

In Claude.ai, this is added under Settings > Connectors > Add custom
connector, using the URL from step 5. Claude will register itself, then open
the login page from step 4 in a browser for you to enter the password.
Connector setup screens do change over time, so if this doesn't match what
you see, check https://support.claude.com for the current steps.

### 7. Try it

Once connected, ask Claude things like:
- "List the Search Console properties you can see"
- "Pull GA4 sessions and conversions by channel for the last 28 days for property 123456789"
- "What's ranking for the query 'loyalty program software' on our site over the last 3 months"
- "Submit our new sitemap at https://99minds.io/sitemap.xml"

## Project structure

```
netlify/functions/
  mcp.mts                                    the MCP JSON-RPC endpoint, checks the Bearer token
  register.mts                                dynamic client registration (/register)
  authorize.mts                               login page + issues auth codes (/authorize)
  token.mts                                    exchanges codes/refresh tokens for access tokens (/token)
  well-known-oauth-authorization-server.mts    AS metadata for discovery
  well-known-oauth-protected-resource.mts      resource metadata for discovery
  lib/
    tools.mts          tool schemas + dispatch
    ga4.mts             GA4 Data API and Admin API calls
    gsc.mts              Search Console API calls
    auth-google.mts       service account token minting for Google APIs
    jwt.mts                sign/verify access tokens (HS256, no external deps)
    oauth-store.mts         Netlify Blobs store handles
    safe-compare.mts         constant-time string comparison
```

A couple of things worth knowing if you ever touch the auth code: authorization
codes are single-use and deleted immediately on exchange, PKCE (S256) is
required and checked with a constant-time comparison, and refresh tokens
rotate on every use so an old one stops working the moment a new one is
issued. There's no token revocation endpoint yet. If you ever need to force
everyone to log in again, the fastest way is to change `MCP_JWT_SECRET` and
redeploy, that instantly invalidates every previously issued access token.

## Extending it

All tool definitions live in `netlify/functions/lib/tools.mts`, and the
actual API calls live in `ga4.mts` and `gsc.mts` in the same folder. To add a
tool: write a function that calls the relevant Google API, add its schema to
`listTools()`, and add a case to `callTool()`. No changes to `mcp.mts` are
needed for new tools.
