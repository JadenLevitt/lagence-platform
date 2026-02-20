# Codebase Concerns

**Analysis Date:** 2026-02-19

## Tech Debt

**Monolithic Route Handler:**
- Issue: `server/routes.ts` contains 1,353 lines with all API endpoints in a single file (feedback, PDF ingestion, email outreach, job processing, etc.)
- Files: `server/routes.ts`
- Impact: Difficult to navigate, maintain, and test. Changes to one feature risk breaking unrelated endpoints. No clear separation of concerns.
- Fix approach: Split routes into modular files by feature domain: `routes/feedback.ts`, `routes/documents.ts`, `routes/outreach.ts`, `routes/jobs.ts`. Use Express routers for composition.

**Dual Implementation Paths:**
- Issue: Core logic exists in both `core/chat-server.js` (450 lines) and `server/routes.ts` (1,353 lines), with overlapping endpoints for chat, job status, field definitions
- Files: `core/chat-server.js`, `server/routes.ts`
- Impact: Unclear which implementation is primary. Bug fixes and features risk being applied to only one version. Confusing for new developers.
- Fix approach: Consolidate to single Express-based implementation in `server/routes.ts`. Remove or archive `core/chat-server.js`. Update deployment to use unified server.

**Manual Environment Variable Threading:**
- Issue: 23+ direct `process.env.*` accesses scattered throughout code without centralized validation or type safety
- Files: `server/routes.ts`, `core/github-pr-service.js`, `core/chat-server.js`, `agents/ecommerce/capabilities/tech-pack-extraction/job-processor.js`
- Impact: Silent failures if env vars missing. No runtime validation. Easy to miss required configs during deployment.
- Fix approach: Create `server/config.ts` with validated schema using Zod. Export typed config object. All env access goes through this module.

**Inconsistent Error Handling Levels:**
- Issue: Some errors logged with `console.error`, others with `console.log`, no structured error codes or severity levels
- Files: Throughout server, core, and agent files
- Impact: Hard to filter logs by severity. Monitoring tools can't distinguish critical failures from info messages.
- Fix approach: Implement structured logging with severity levels (ERROR, WARN, INFO, DEBUG). Use consistent format with timestamp, level, context.

## Known Bugs

**`.single()` Database Queries Without Error Handling:**
- Symptoms: If a query expecting one result returns zero rows, the app crashes with cryptic error
- Files: `server/routes.ts` (lines 464, 556, 900, 912), `core/chat-server.js`, `github-pr-service.js`, `job-processor.js`
- Trigger: Request for non-existent job ID, user ID, or document ID
- Workaround: Use `.maybeSingle()` which returns `null` instead of error when no rows match. Currently used nowhere.
- Note: This is flagged in memory.md as fixed in Steady Platform - apply same pattern here.

**Hardcoded IP Address in Widget:**
- Symptoms: Chat widget always tries to connect to `http://167.71.145.110:3000` (an old VM IP)
- Files: `core/chat-widget.js` line 25
- Trigger: Any page including the chat widget script
- Current workaround: Set `window.LAGENCE_CHAT_CONFIG.apiUrl` before script load
- Fix: Use relative paths or environment-based configuration instead of hardcoded IPs.

**Unhandled Promise in Job Processor:**
- Symptoms: Feedback preferences loaded without await; preferences may be undefined if promise hasn't resolved
- Files: `agents/ecommerce/capabilities/tech-pack-extraction/job-processor.js` lines 22-28
- Trigger: Extraction runs immediately after job processor starts, before preferences load
- Impact: Learned preferences not applied to first extraction attempt
- Fix: Make preference loading synchronous or defer extraction until preferences loaded.

**Race Condition in Rate Limiter:**
- Symptoms: In high-concurrency scenarios, rate limiter cleanup interval could delete entries mid-request
- Files: `server/routes.ts` lines 94-105
- Trigger: Many concurrent requests hitting rate limiter while cleanup interval runs
- Severity: Low - would only affect rate limit accuracy, not cause crashes
- Fix: Use Set instead of Map for timestamps, or use atomic operations.

## Security Considerations

**Unvalidated File Uploads:**
- Risk: CSV/PDF files uploaded via `/api/start-job` and `/api/documents/upload` are written to Supabase storage with minimal validation
- Files: `server/routes.ts` lines 328-380, 936-991
- Current mitigation: Multer limits file size to 10MB. MIME type checked for PDFs only.
- Recommendations:
  - Add virus scanning (ClamAV integration)
  - Validate CSV structure before processing (check headers, row counts)
  - Sanitize filenames to prevent path traversal
  - Add rate limiting per user/IP for uploads

**Public Google Sheets Permission:**
- Risk: Line 614 sets `"type": "anyone"` making extracted data sheets publicly readable to anyone with URL
- Files: `server/routes.ts` line 614
- Current mitigation: URLs are opaque (long spreadsheet IDs) but not secret
- Recommendations:
  - Log all sheet URL accesses
  - Add authentication requirement for sheet viewing
  - Consider restricting to domain-specific viewers (organizational emails only)
  - Add audit trail for data access

**Exposed Anthropic API in Frontend:**
- Risk: Anthropic model names hardcoded in multiple places (`claude-sonnet-4-20250514`)
- Files: `server/routes.ts` line 307, `core/chat-server.js` line 300, `core/github-pr-service.js` line 56
- Current mitigation: Only used server-side, not sent to frontend
- Recommendations: Create server config for model selection. Allow switching models without code changes.

**Missing Authentication on All API Endpoints:**
- Risk: No auth required for `/api/chat`, `/api/start-job`, `/api/documents/upload`, `/api/feedback`, or feedback processing
- Files: `server/routes.ts` - every POST/GET endpoint
- Current mitigation: Rate limiting on IP (easily spoofable), no user identity
- Recommendations:
  - Add JWT or session-based auth
  - Implement per-user rate limits
  - Audit who uploaded what data
  - Add role-based access (admin can see all feedback, users only their own)

## Performance Bottlenecks

**Large File Processing in Memory:**
- Problem: Job processor loads entire CSV/PDF into memory before extraction. Playwright browser instance spawned per job.
- Files: `agents/ecommerce/capabilities/tech-pack-extraction/job-processor.js`
- Cause: Multer memoryStorage (line 63 in routes.ts) loads full file. No streaming. One browser per job = resource exhaustion.
- Improvement path:
  - Switch to disk storage for large files
  - Implement browser pool / worker threads to reuse instances
  - Stream data processing instead of batch

**Full JSON Logging of API Responses:**
- Problem: Every API response logged with full JSON body (line 52 in index.ts). Large extracted_data objects bloat logs.
- Files: `server/index.ts` lines 51-52
- Cause: `JSON.stringify(capturedJsonResponse)` on all responses
- Improvement path: Only log response size or status, not full body. Or use sampling (log 1% of requests).

**Synchronous Agent Reload Every 30 Seconds:**
- Problem: `loadAllAgents()` reads filesystem and parses JSON every 30s (line 57-59 in routes.ts, line 131-133 in chat-server.js)
- Files: `server/routes.ts`, `core/chat-server.js`
- Cause: File system I/O blocks event loop during reload
- Improvement path: Watch for file changes (chokidar) instead of polling. Or use in-memory agent registry updated on deployment.

## Fragile Areas

**Agent/Capability Loading System:**
- Files: `core/agent-loader.js`
- Why fragile: Silently skips invalid agent.json/capability.json files (lines 33-39, 64-71). If JSON is malformed, agent partially loads. No validation of required fields.
- Safe modification:
  - Add schema validation (Zod) for agent.json and capability.json
  - Fail fast on missing required fields (id, name, capabilities)
  - Add config file audit endpoint to show which agents loaded successfully
- Test coverage: No tests for malformed JSON, missing files, or permission errors

**Data Merger:**
- Files: `shared/data-merger.js`
- Why fragile: Takes array of sources with arbitrary JSONB data structure. No schema validation. Merge logic not visible in read files.
- Safe modification: Review merge algorithm for edge cases (duplicate keys, type mismatches, null handling)
- Test coverage: Unknown, likely minimal

**Email Outreach Template System:**
- Files: `agents/ecommerce/capabilities/email-outreach/email-templates` (not read, likely in agents/)
- Why fragile: Capability change endpoint (lines 1184-1274 in routes.ts) loads templates and renders with user-provided context. Risk of template injection.
- Safe modification: Sanitize template context. Use mustache/handlebars with escaping enabled. Never use eval-style template syntax.
- Test coverage: No visible tests for template rendering

**Chat Classification to PR Creation:**
- Files: `core/github-pr-service.js`, `server/routes.ts` lines 285-289
- Why fragile: Classification can fail silently (returns defaults), but PR creation assumes classification succeeded. No transactional guarantee.
- Safe modification: Add validation that classification has required fields. Separate PR creation into distinct endpoint so failures are clear.
- Test coverage: No tests for malformed classification responses

## Scaling Limits

**Single Rate Limiter Map in Memory:**
- Current capacity: Stores one timestamp array per unique IP. ~1KB per active IP.
- Limit: With thousands of concurrent IPs, memory grows unbounded until cleanup interval runs.
- Scaling path: Switch to Redis-based rate limiter (ioredis + rate-limiter-flexible). Works across multiple server instances.

**File Storage in Supabase:**
- Current capacity: 10MB per file (multer limit). Unlimited total storage limited by Supabase plan.
- Limit: No retention policy. Old extracted data accumulates forever. Queries slow as table grows.
- Scaling path: Add data retention policy (delete jobs older than 90 days). Add pagination to job listing. Index by created_at.

**Browser Pool for Job Processing:**
- Current capacity: One Playwright browser instance per job. Each browser = ~200MB RAM.
- Limit: With 10 concurrent jobs = 2GB RAM. Server OOMs beyond that.
- Scaling path: Implement worker pool with max 2-3 concurrent browsers. Queue jobs. Add job timeout.

**Anthropic API Rate Limits:**
- Current capacity: No tracking of API usage or rate limit headers.
- Limit: Hitting Anthropic rate limit stops all chat, classification, and extraction.
- Scaling path: Implement token bucket rate limiter. Track usage. Queue requests if approaching limit. Add fallback responses.

## Dependencies at Risk

**Playwright Dependency:**
- Risk: Playwright used for automated browser testing in job processor. Large (~250MB), breaks frequently with Chromium updates.
- Impact: Job processor may fail to extract tech packs if browser API changes.
- Migration plan: Evaluate PDF.js (client-side) for PDF extraction, reducing browser dependency. Or use headless Chrome directly with lighter wrapper.

**Supabase Service Key in Environment:**
- Risk: Service key grants full database access. Leaked key = total data compromise.
- Impact: If `.env` or deployment config exposed, attacker can read/modify all data.
- Migration plan: Use role-based Supabase auth. Create service role with minimal permissions (only what job processor needs).

## Missing Critical Features

**No Audit Trail:**
- Problem: No logging of who extracted what data, what feedback was submitted, or when preferences changed.
- Blocks: Compliance requirements, debugging user issues, understanding feature usage.
- Test coverage gaps: No tests validate audit entries are created.

**No Data Deletion / Retention Policy:**
- Problem: Old jobs, documents, and feedback accumulate forever in database.
- Blocks: GDPR right-to-be-forgotten compliance, data minimization.
- Implementation approach: Add scheduled job to soft-delete data older than retention window. Add flag to suppress from queries.

**No Job Timeout:**
- Problem: Job processor can hang indefinitely if Playwright crashes silently or network fails.
- Blocks: Managing runaway jobs, preventing resource exhaustion.
- Implementation approach: Set 1-hour timeout on job processor. Kill browser if extraction exceeds timeout. Mark job as failed.

**No Request Validation Schema:**
- Problem: 34 input validation points (req.body, req.query, req.params) with ad-hoc if statements. No consistent validation.
- Blocks: Clear error messages to clients, preventing malformed requests from reaching business logic.
- Implementation approach: Use Zod or Joi for route validation middleware. Define schemas for all endpoints.

## Test Coverage Gaps

**No Automated Tests:**
- What's not tested: All API endpoints, job processing pipeline, agent loading, data merging, email template rendering.
- Files: Entire `server/`, `core/`, `agents/`, `shared/` directories
- Risk: Refactoring breaks endpoints without warning. PR changes introduce regressions.
- Priority: **High** - Add baseline integration tests for critical paths (start job, chat, extract)

**Job Processor Crash Scenarios:**
- What's not tested: Behavior when browser fails, network times out, Anthropic API unavailable, file corrupted.
- Files: `agents/ecommerce/capabilities/tech-pack-extraction/job-processor.js`
- Risk: Unknown how gracefully jobs fail. May silently hang or corrupt database.
- Priority: **High** - Add error injection tests for timeout, network, and API failures.

**Database Query Error Paths:**
- What's not tested: `.single()` returning no rows, database connection drops mid-request, Supabase rate limits.
- Files: `server/routes.ts`, `core/chat-server.js`
- Risk: Silent crashes, unclear error messages to clients.
- Priority: **Medium** - Add tests for all database error scenarios.

**Rate Limiter Edge Cases:**
- What's not tested: Requests at exact rate limit boundary, cleanup interval deleting entries mid-request, spoofed IPs.
- Files: `server/routes.ts` lines 70-105
- Risk: Rate limiter ineffective, easy DoS.
- Priority: **Medium** - Add tests for concurrent requests, clock skew, cleanup race conditions.

**Email Outreach Template Injection:**
- What's not tested: Rendering templates with malicious context (HTML, script tags), missing template variables.
- Files: `agents/ecommerce/capabilities/email-outreach/email-templates`
- Risk: XSS in email bodies, template failures.
- Priority: **High** - Add tests for template escaping and error handling.

---

*Concerns audit: 2026-02-19*
