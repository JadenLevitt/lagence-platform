# External Integrations

**Analysis Date:** 2026-02-19

## APIs & External Services

**Anthropic Claude AI:**
- AI conversation and reasoning capabilities
  - SDK/Client: `@anthropic-ai/sdk` 0.71.2
  - Model used: `claude-sonnet-4-20250514`
  - Integration: `server/routes.ts` and `core/chat-server.js`
  - Usage: Chat responses, request classification, data analysis

**Resend Email Service:**
- Email delivery and notifications
  - Endpoint: `https://api.resend.com/emails`
  - Method: POST with Bearer token auth
  - Integration: `shared/email-service.js`, `server/routes.ts`
  - Auth: `RESEND_API_KEY` environment variable
  - Optional sender override: `RESEND_FROM_EMAIL` env var

**GitHub API:**
- Pull request creation for capability changes
  - Endpoint: GitHub API v3 (https://api.github.com)
  - Auth: `GITHUB_TOKEN` environment variable (personal access token)
  - Integration: `core/github-pr-service.js`
  - Operations: Create branches, open PRs, read repo info
  - Config: `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` env vars (defaults: JadenLevitt/lagence-platform)

## Data Storage

**Databases:**
- Supabase (PostgreSQL)
  - Connection: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
  - Client: `@supabase/supabase-js` 2.93.2
  - Integration: `server/routes.ts`, `core/chat-server.js`, `core/github-pr-service.js`, `shared/supabase-client.js`
  - Migrations: `supabase/migrations/` (numbered 001-005)
    - 001_initial_tables.sql
    - 002_job_resume_columns.sql
    - 003_user_feedback.sql
    - 004_pdf_ingestion.sql
    - 005_email_outreach.sql
  - Tables: Jobs, feedback, PDFs, proposals, email campaigns, user interactions

**File Storage:**
- In-memory temporary: `multer` with memory storage for file uploads
  - Limit: 10MB per file
  - Integration: `server/routes.ts` for `/api/start-job` endpoint
  - No persistent file storage configured

**Caching:**
- React Query (@tanstack/react-query) - Client-side API response caching
- No server-side cache layer (Redis, etc.)

## Authentication & Identity

**Auth Provider:**
- Google OAuth (optional integration)
  - Config: `GOOGLE_CLIENT_ID` environment variable
  - Client setup: `server/config.ts`
  - Status: Configured but integration not fully visible in sampled code

**Custom Bearer Token:**
- Optional bearer token authentication
  - Config: `BEARER_TOKEN` environment variable
  - Location: `server/config.ts`

**Session Management:**
- No visible session library in stack
- Bearer token or Google OAuth flow expected for requests

## Monitoring & Observability

**Error Tracking:**
- None detected in codebase

**Logs:**
- Console logging throughout codebase
- Express middleware logs all `/api` requests with method, status, duration, response body
- Log format: `[timestamp] [source] message`

## CI/CD & Deployment

**Hosting:**
- Not specified in codebase (likely manual deployment)

**CI Pipeline:**
- GitHub Actions configured: `.github/workflows/` (directory exists)
- Content not examined

## Environment Configuration

**Required Environment Variables:**

Core:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key (for server operations)
- `PORT` - HTTP server port (defaults to 3000)

AI & Claude:
- (No explicit API key required - SDK uses system default or can be configured)

Email:
- `RESEND_API_KEY` - Resend API key for sending emails (optional)
- `RESEND_FROM_EMAIL` - Default sender email (optional, defaults to `onboarding@resend.dev`)
- `NOTIFICATION_EMAIL` - Recipient for capability change notifications (optional)

Authentication:
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (optional)
- `BEARER_TOKEN` - Bearer token for API requests (optional)

GitHub Integration:
- `GITHUB_TOKEN` - GitHub personal access token for PR creation (optional)
- `GITHUB_REPO_OWNER` - GitHub repo owner (defaults to `JadenLevitt`)
- `GITHUB_REPO_NAME` - GitHub repo name (defaults to `lagence-platform`)

Development:
- `NODE_ENV` - `development` or `production`
- Doppler CLI required for dev (manages secrets locally)

**Secrets Location:**
- Development: Doppler (encrypted secrets management)
- Production: Environment variables (assumed in deployment platform)
- No `.env` files committed to repo

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Email notifications via Resend API when capability changes are proposed
- GitHub PR creation when capability change requests are submitted
- Supabase real-time subscriptions could be used but not visible in sampled code

---

*Integration audit: 2026-02-19*
