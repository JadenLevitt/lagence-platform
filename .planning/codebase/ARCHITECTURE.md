# Architecture

**Analysis Date:** 2026-02-19

## Pattern Overview

**Overall:** Multi-Agent AI Platform with Modular Capability System

**Key Characteristics:**
- **Pluggable Agent Architecture** - Agents auto-discover from filesystem, define capabilities declaratively
- **Capability-Driven Design** - Each capability is a self-contained module with config, triggers, and actions
- **Process Spawning** - Long-running tasks (job processing) spawn as detached child processes
- **Full-Stack Integration** - Backend Express API orchestrates Claude AI, file storage (Supabase), and external APIs (Google Sheets, Resend)
- **Data-Driven Configuration** - Agent behavior, field extraction rules, email templates all live in JSON/JS config files

## Layers

**Presentation Layer:**
- Purpose: React client UI for agent dashboards and task management
- Location: `client/src/`
- Contains: Page components (admin, results, home), UI component library, hooks, queries
- Depends on: Express API routes, TanStack React Query for state
- Used by: End-user browser

**API/Route Layer:**
- Purpose: HTTP endpoint handler for all platform operations
- Location: `server/routes.ts`
- Contains: ~1350 lines of route handlers organized by domain (chat, jobs, documents, feedback, outreach)
- Depends on: Supabase client, Anthropic SDK, multer for file uploads
- Used by: Client UI, external services (webhooks)

**Agent Orchestration:**
- Purpose: Load agents from filesystem, route requests, invoke capabilities
- Location: `core/agent-loader.js`, `server/routes.ts` (lines 24-60)
- Contains: Agent discovery, capability loading, system prompt generation
- Depends on: Agent configs at `agents/[agentId]/agent.json` and `agents/[agentId]/capabilities/`
- Used by: Routes layer for chat and capability invocation

**Capability/Domain Layer:**
- Purpose: Domain-specific handlers for features like tech pack extraction, PDF ingestion, feedback processing
- Location: `agents/ecommerce/capabilities/[capability]/`
- Contains: Capability config JSON, processor JS, field definitions, templates
- Depends on: Anthropic SDK, Supabase, external APIs (Google Sheets, Resend)
- Used by: Routes that orchestrate these capabilities

**Shared Services:**
- Purpose: Cross-cutting utilities for email, data merging, configuration
- Location: `shared/` (compiled .js modules)
- Contains: `email-service.js`, `data-merger.js`, `supabase-client.js`
- Depends on: Supabase, Resend, external APIs
- Used by: Routes and capabilities

**Data Access Layer:**
- Purpose: Supabase database and file storage operations
- Location: Via `createClient()` in `server/routes.ts:18`
- Contains: Tables for jobs, user_feedback, uploaded_documents, outreach_emails, team_contacts, learned_preferences, capability_proposals
- Depends on: Supabase environment variables
- Used by: All route handlers

## Data Flow

**Chat Request Flow:**

1. Client sends POST to `/api/chat` with `messages` array
2. Routes layer retrieves agent definition (line 255)
3. Builds system prompt using `buildAgentSystemPrompt()` (line 263)
4. Classifies request via GitHub PR service (line 265) - determines if it's a regular question or capability change request
5. If regular question: Claude generates response via Anthropic SDK (line 306)
6. If capability change request: Saves to `capability_proposals` table (line 124) and optionally emails notification (line 148)
7. Returns JSON response with message, classification, and optional action

**Job Processing Flow:**

1. Client uploads CSV + file via POST to `/api/start-job` (line 328)
2. File stored to Supabase `job-inputs` bucket (line 360)
3. Job record created in `jobs` table with `pending` status (line 389)
4. Job processor spawned as detached child process (line 419)
5. Processor runs `agents/ecommerce/capabilities/tech-pack-extraction/job-processor.js`
6. Processor extracts data, updates `jobs` table with `extracted_data` and progress
7. Client polls `/api/job-status/:id` (line 451) to track progress
8. When complete, client calls POST `/api/create-google-sheet` (line 541) which:
   - Fetches extracted data from job record
   - Creates Google Sheet via Sheets API
   - Populates with extracted data and extraction logic metadata
   - Updates job with output_sheet_url

**Document Merge Flow:**

1. User uploads PDF via POST `/api/documents/upload` (line 936)
2. Stored to Supabase `documents` bucket
3. User requests extraction via POST `/api/documents/:id/extract` (line 994)
4. Document processor runs Claude Vision on PDF (via `processDocument()`)
5. Extracted data stored in `uploaded_documents.extracted_data`
6. User merges PDF data into job via POST `/api/documents/:id/merge/:jobId` (line 1047)
7. `mergeDataSources()` combines tech pack + PDF data with configurable priority
8. Returns merged result and provenance tracking

**Feedback Loop Flow:**

1. User submits feedback via POST `/api/feedback` (line 804) - rating or field correction
2. Stored in `user_feedback` table with job context
3. Manual trigger via POST `/api/feedback/process` runs `processFeedbackPatterns()` (line 921)
4. Feedback patterns analyzed, learned rules generated
5. Stored in `learned_preferences` table
6. Next extraction uses learned rules to improve extraction prompts

**Email Outreach Flow:**

1. Draft email via POST `/api/outreach/draft` (line 1184)
2. Renders template with context, determines risk level
3. If low-risk: auto-sends immediately via Resend
4. If high-risk: saves as `pending_approval` status
5. Admin approves via POST `/api/outreach/:id/approve` (line 1277)
6. Email sent and status updated to `sent`

**State Management:**
- Client: React Query for server state caching via `queryClient` (client/src/lib/queryClient.ts)
- Server: Supabase for persistent state (tables), process state via spawned child processes
- Agent behavior: Declarative via agent.json and capability.json files, loaded at startup and every 30s

## Key Abstractions

**Agent Definition:**
- Purpose: Represents an AI agent with identity, personality, and capabilities
- Examples: `agents/ecommerce/agent.json`
- Pattern: JSON file with id, name, title, personality, greeting, expertise areas, known agents, access level

**Capability:**
- Purpose: Self-contained unit of agent functionality with triggers and actions
- Examples:
  - `agents/ecommerce/capabilities/tech-pack-extraction/capability.json` (extraction with field definitions)
  - `agents/ecommerce/capabilities/feedback-loop/capability.json` (learning system)
- Pattern: JSON config file declaring capability metadata, plus JS modules for logic

**Field Definition:**
- Purpose: Specifies what data to extract, how to extract it, and validation rules
- Examples: Lines 9-145 in `agents/ecommerce/capabilities/tech-pack-extraction/extraction-config.js`
- Pattern: Objects with field_name, source, extraction_logic, examples, validation rules

**Email Template:**
- Purpose: Reusable message structure with placeholders
- Location: `agents/ecommerce/capabilities/email-outreach/email-templates.js`
- Pattern: `renderTemplate(template_id, context)` returns subject/html/risk-level

**Team Contact:**
- Purpose: Team member info and data domain ownership
- Location: `agents/ecommerce/capabilities/email-outreach/contacts-config.js` and `team_contacts` table
- Pattern: team_name, contact_name, email, data_domains array

## Entry Points

**Server Startup:**
- Location: `server/index.ts` (lines 62-92)
- Triggers: Node.js process start
- Responsibilities: Create Express app, register routes, setup middleware, Vite (dev) or static serving (prod)

**API Routes:**
- Location: `server/routes.ts:176-1353`
- Triggers: HTTP requests to `/api/*` and `/health`
- Responsibilities: Validate input, coordinate services, return JSON responses

**Agent Chat:**
- Location: `server/routes.ts:231-325` (POST `/api/chat`)
- Triggers: User sends message in chat interface
- Responsibilities: Load agent, classify request, invoke Claude or capability

**Job Start:**
- Location: `server/routes.ts:328-448` (POST `/api/start-job`)
- Triggers: User uploads CSV for processing
- Responsibilities: Validate file, store to Supabase, spawn processor, return jobId

**Job Processor:**
- Location: `agents/ecommerce/capabilities/tech-pack-extraction/job-processor.js`
- Triggers: Spawned by start-job route
- Responsibilities: Download tech pack PDFs, extract via Claude Vision, update job status, store results

**Client Router:**
- Location: `client/src/App.tsx`
- Triggers: Browser load
- Responsibilities: Route to AdminDashboard, AgentDashboard, TaskPage

## Error Handling

**Strategy:** Synchronous validation with async try-catch, errors logged to console and returned in JSON responses

**Patterns:**
- Route validation: Zod schema parsing (e.g., `uuidSchema` line 67)
- Rate limiting: In-memory map of IPs with sliding window (lines 70-105)
- Database errors: Caught from Supabase operations, returned as 500 with error.message
- File operations: Checked for existence before reading, stored sizes checked against limits
- Async/await errors: Try-catch in all async route handlers, logs to console, returns 500 status

## Cross-Cutting Concerns

**Logging:**
- Approach: Console.log with timestamp and source labels
- Pattern: `log(message, source)` exported from server/index.ts (lines 25-34)
- Used for: Request timing, job processing steps (marked with [STEP N], [ERROR], etc.)

**Validation:**
- Approach: Zod schemas for type-safe parsing
- Location: `server/routes.ts` (uuid validation line 67)
- Pattern: `.safeParse()` for non-critical validation, `.parse()` for strict validation

**Authentication:**
- Approach: Not implemented in routes
- Bearer token: Config reads from env (server/config.ts:4) but not used in route handlers
- Note: All endpoints public; auth could be added via middleware

**Rate Limiting:**
- Approach: In-memory sliding window per IP
- Location: `server/routes.ts:70-105`
- Applied to: POST `/api/chat` only (30 requests per 60s window)

**File Handling:**
- Approach: Multer memory storage with size limits
- Location: `server/routes.ts:62-65`
- Limits: 10MB per file

**Data Merging:**
- Approach: Configurable priority-based merge of multiple data sources
- Location: `shared/data-merger.js`
- Used by: PDF merge endpoint (line 1087)
