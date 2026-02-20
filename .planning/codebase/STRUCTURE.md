# Codebase Structure

**Analysis Date:** 2026-02-19

## Directory Layout

```
lagence-platform/
├── agents/                     # Agent definitions and capabilities
│   └── ecommerce/              # Emma the ecommerce agent
│       ├── agent.json          # Agent config
│       └── capabilities/       # Domain-specific functionality
│           ├── tech-pack-extraction/
│           ├── pdf-ingestion/
│           ├── feedback-loop/
│           ├── email-outreach/
│           └── catsy-metadata/
├── client/                     # React frontend (Vite)
│   ├── src/
│   │   ├── App.tsx            # Router
│   │   ├── main.tsx           # Entry point
│   │   ├── pages/             # Page components
│   │   ├── components/        # Reusable React components
│   │   ├── hooks/             # Custom React hooks
│   │   └── lib/               # Utilities (React Query, utils)
│   ├── index.html             # HTML template
│   └── public/                # Static assets
├── core/                      # Core platform modules (CommonJS)
│   ├── agent-loader.js        # Discovers and loads agents
│   ├── chat-server.js         # Legacy/utility
│   ├── chat-widget.js         # Legacy/utility
│   └── github-pr-service.js   # Request classification
├── server/                    # Express backend (TypeScript)
│   ├── index.ts              # Server startup, middleware setup
│   ├── routes.ts             # All HTTP endpoint handlers (~1350 lines)
│   ├── config.ts             # Environment config
│   ├── vite.ts               # Vite middleware setup (dev mode)
│   └── static.ts             # Static file serving (prod mode)
├── shared/                   # Shared utility modules (CommonJS)
│   ├── email-service.js      # Resend integration
│   ├── data-merger.js        # Multi-source data merge logic
│   └── supabase-client.js    # Supabase initialization
├── shared-capabilities/      # Potential shared capability modules (empty)
├── supabase/                # Supabase migrations and config
│   └── migrations/          # Database schema migrations
├── script/                  # Build scripts
│   └── build.ts            # esbuild bundling
├── dist/                   # Production build output
│   └── public/             # Bundled client assets
├── node_modules/           # Dependencies
├── package.json            # Project metadata and scripts
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite build configuration
├── postcss.config.js       # PostCSS (Tailwind)
├── components.json         # Shadcn/ui config
└── .planning/              # Planning and documentation
    └── codebase/           # Architecture docs
```

## Directory Purposes

**agents/**
- Purpose: Agent definitions and their capabilities - the domain layer
- Contains: Agent metadata (JSON), capability configs, processors, templates, extraction rules
- Key files:
  - `agents/ecommerce/agent.json`: Emma's definition, personality, expertise
  - `agents/ecommerce/capabilities/*/capability.json`: Capability metadata
  - `agents/ecommerce/capabilities/*/extraction-config.js`: Field extraction rules
  - `agents/ecommerce/capabilities/*/[processor|templates|contacts].js`: Implementation

**client/src/**
- Purpose: React application code
- Contains: Page components, UI library, hooks, API queries, utilities
- Key files:
  - `client/src/App.tsx`: Router setup (wouter)
  - `client/src/pages/admin-dashboard.tsx`: Main dashboard
  - `client/src/pages/results.tsx`: Agent response display
  - `client/src/pages/home.tsx`: Task/job management page
  - `client/src/components/ui/`: Shadcn/ui component library
  - `client/src/lib/queryClient.ts`: React Query setup

**core/**
- Purpose: Core platform logic (loaded via dynamic require from routes)
- Contains: Agent discovery, chat logic, request classification
- Key files:
  - `core/agent-loader.js`: Discovers agents from `agents/` dir, loads capabilities, builds prompts
  - `core/github-pr-service.js`: Uses Claude to classify user requests

**server/**
- Purpose: Express backend and HTTP routing
- Contains: All API endpoints, request validation, service orchestration
- Key files:
  - `server/index.ts`: Express setup, middleware, error handling, startup
  - `server/routes.ts`: All route handlers (chat, jobs, documents, feedback, outreach)
  - `server/config.ts`: Environment variable loading
  - `server/vite.ts`: Development middleware (Vite dev server)
  - `server/static.ts`: Production static file serving

**shared/**
- Purpose: Cross-cutting utilities
- Contains: Email service (Resend), data merging logic, Supabase client
- Key files:
  - `shared/email-service.js`: sendEmail(), isEmailConfigured()
  - `shared/data-merger.js`: mergeDataSources() for combining tech pack + PDF data
  - `shared/supabase-client.js`: Supabase initialization

**supabase/migrations/**
- Purpose: Database schema version control
- Contains: SQL migration files for all tables
- Key tables: jobs, user_feedback, uploaded_documents, outreach_emails, team_contacts, learned_preferences, capability_proposals, job_results

## Key File Locations

**Entry Points:**

- `server/index.ts` - Node.js server startup
- `client/src/main.tsx` - React app entry point
- `client/index.html` - HTML template
- `package.json` - Build and run scripts

**Configuration:**

- `server/config.ts` - Environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_CLIENT_ID, BEARER_TOKEN)
- `agents/ecommerce/agent.json` - Agent definition
- `agents/ecommerce/capabilities/*/capability.json` - Capability metadata
- `agents/ecommerce/capabilities/*/extraction-config.js` - Field definitions
- `components.json` - Shadcn/ui configuration

**Core Logic:**

- `server/routes.ts` - HTTP endpoint implementation (1350 lines, 30+ endpoints)
- `core/agent-loader.js` - Agent discovery and prompt building
- `core/github-pr-service.js` - Request classification
- `agents/ecommerce/capabilities/tech-pack-extraction/job-processor.js` - Job execution
- `agents/ecommerce/capabilities/pdf-ingestion/pdf-processor.js` - PDF analysis
- `agents/ecommerce/capabilities/feedback-loop/feedback-processor.js` - Pattern learning

**Testing:**

- No test files found (not implemented)

## Naming Conventions

**Files:**
- TypeScript: `camelCase.ts` (e.g., `queryClient.ts`, `use-mobile.tsx`)
- JavaScript: `camelCase.js` (e.g., `agent-loader.js`, `data-merger.js`)
- Components: `PascalCase.tsx` (e.g., `AdminDashboard`, `not-found.tsx` as exception)
- Config: `lowercase.json` or `.js` (e.g., `agent.json`, `extraction-config.js`)
- Utilities: `kebab-case.ts` (e.g., `use-mobile.tsx`) for hooks, `camelCase.ts` for others

**Directories:**
- Feature: `kebab-case/` (e.g., `tech-pack-extraction`, `pdf-ingestion`, `email-outreach`)
- Type: `lowercase/` (e.g., `pages`, `components`, `lib`, `capabilities`)

**Route Patterns:**
- `/api/[resource]/[action]` - REST-ish convention
- Examples:
  - `/api/chat` - POST to chat with agent
  - `/api/agents` - GET list of agents
  - `/api/agents/:id` - GET agent details
  - `/api/jobs` - GET job list
  - `/api/job-status/:id` - GET job status
  - `/api/start-job` - POST to create new job
  - `/api/documents/upload` - POST to upload PDF
  - `/api/documents/:id/extract` - POST to extract from document
  - `/api/feedback` - POST/GET feedback operations
  - `/api/outreach/draft` - POST to draft email

## Where to Add New Code

**New Capability:**

Implementation:
- Create `agents/ecommerce/capabilities/[capability-id]/` directory
- Add `capability.json` with metadata (id, name, description, triggers, actions, status, complexity)
- Add implementation files (e.g., `processor.js`, `config.js`, `templates.js`, `contacts-config.js`)

Database:
- Add Supabase migration for tables (if storing results)
- Register table queries in `server/routes.ts`

Routes:
- If the capability needs new endpoints, add to `server/routes.ts`
- Follow pattern: POST for actions, GET for listing/retrieving

Example: To add a new "inventory-sync" capability:
```
agents/ecommerce/capabilities/inventory-sync/
├── capability.json
├── processor.js
├── config.js
└── triggers.json
```

**New API Endpoint:**

Location: Add to `server/routes.ts` in `registerRoutes()` function

Pattern:
```typescript
app.post("/api/[resource]/[action]", async (req, res) => {
  try {
    // Validate input
    if (!req.body.required_field) {
      return res.status(400).json({ error: "..." });
    }

    // Execute logic
    const { data, error } = await supabase.from("table").select(...);
    if (error) return res.status(500).json({ error: error.message });

    // Return response
    return res.json({ success: true, data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
```

**New React Component:**

Location: `client/src/components/` or `client/src/pages/`

Pattern:
- Use Shadcn/ui base components from `client/src/components/ui/`
- Use React Query from `@tanstack/react-query`
- Use hooks from `client/src/hooks/`
- Style with Tailwind CSS classes

Example:
```tsx
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";

export default function MyComponent() {
  const { data } = useQuery({
    queryKey: ["endpoint"],
    queryFn: () => fetch("/api/endpoint").then(r => r.json()),
  });

  return <Card>{/* component JSX */}</Card>;
}
```

**New Shared Utility:**

Location: `shared/[utility-name].js`

Pattern:
- Export functions or objects
- Use CommonJS (require/module.exports)
- Loaded by `server/routes.ts` via `loadModule()` (line 13)

Example:
```javascript
function myHelper(input) {
  // implementation
  return output;
}

module.exports = { myHelper };
```

## Special Directories

**dist/**
- Purpose: Production build output
- Generated: Yes (via esbuild)
- Committed: No (added to .gitignore)
- Contents: `dist/index.cjs` (bundled server), `dist/public/` (bundled client)

**node_modules/**
- Purpose: npm dependencies
- Generated: Yes (via npm install)
- Committed: No (in .gitignore)

**supabase/migrations/**
- Purpose: Version-controlled database schema
- Generated: No (manually created)
- Committed: Yes
- Naming: Sequential numbered files (non-timestamp naming per Jaden's convention)

**.planning/codebase/**
- Purpose: Architecture documentation
- Generated: Yes (via GSD tools)
- Committed: Yes
- Contents: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md, STACK.md, INTEGRATIONS.md

**agents/ecommerce/capabilities/**
- Purpose: Hot-reloadable capability definitions
- Contents: Agent-specific domain logic and configuration
- Reload: Auto-discovered every 30 seconds (server/routes.ts:57)
- Pattern: Each capability is a self-contained module that can be updated without server restart
