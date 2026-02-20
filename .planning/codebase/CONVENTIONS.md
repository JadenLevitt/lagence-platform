# Coding Conventions

**Analysis Date:** 2026-02-19

## Naming Patterns

**Files:**
- TypeScript files use lowercase with hyphens: `agent-loader.js`, `github-pr-service.js`, `chat-widget.js`
- Component files use PascalCase: `App.tsx`, `AdminDashboard.tsx`, `TaskPage.tsx`
- UI components are in `components/ui/` directory with kebab-case names: `button.tsx`, `alert-dialog.tsx`, `input-group.tsx`
- Hook files use kebab-case with `use-` prefix: `use-toast.ts`, `use-mobile.tsx`
- Page files use kebab-case: `admin-dashboard.tsx`, `not-found.tsx`

**Functions:**
- Standard camelCase for functions: `sendCapabilityChangeNotification()`, `checkRateLimit()`, `throwIfResNotOk()`
- Async functions clearly marked with `async` keyword
- Helper functions prefixed with descriptor: `getQueryFn()`, `buildAgentSystemPrompt()`, `loadAllAgents()`

**Variables:**
- camelCase for all variables: `rateLimiter`, `clientIP`, `capturedJsonResponse`, `RATE_LIMIT` (constants)
- Constants in UPPER_SNAKE_CASE: `TOAST_LIMIT`, `RATE_WINDOW`, `NOTIFICATION_EMAIL`
- Destructured variables clearly named: `const { data, error } = await supabase...`
- Single letter variables for iterators: `i`, `t` (in array maps), but descriptive for loops: `requests.filter()`

**Types:**
- PascalCase for types and interfaces: `ButtonProps`, `ToasterToast`, `Agent`
- Type aliases prefixed with `Type` or simply the domain: `Toast`, `Action`, `State`
- Discriminated unions use `type: "ACTION_NAME"` pattern in const objects: `actionTypes = { ADD_TOAST: "ADD_TOAST", ... }`
- Generic parameter names: `T` for single generic, descriptive for specific domains

## Code Style

**Formatting:**
- No explicit linter config detected in `.eslintrc` or `eslint.config.*`
- TypeScript strict mode enabled (`"strict": true` in `tsconfig.json`)
- Module resolution: `"moduleResolution": "bundler"` for dual ESM/CJS support
- Import extensions allowed: `"allowImportingTsExtensions": true`

**Linting:**
- No formal linting configuration in repository
- TypeScript compiler is sole validator: `tsc` command in package.json
- Type checking via `npm run check` which runs `tsc` with `noEmit: true`

**Code Organization:**
- Imports grouped in logical order: external libraries, then types, then local modules
- Imports use full module paths in server code: `const Anthropic = require("@anthropic-ai/sdk")`
- Dynamic requires for CommonJS modules: `const { loadAllAgents } = loadModule("core/agent-loader")`

## Import Organization

**Order:**
1. External framework/library imports: `express`, `@supabase/supabase-js`, React
2. Type imports: `import type { Express } from "express"`
3. Local module imports: `from "./routes"`, `from "@/components/ui/button"`
4. Dynamic requires (server only): `loadModule("core/agent-loader")`

**Path Aliases:**
- Client: `@/*` → `./client/src/*`
- Shared: `@shared/*` → `./shared/*`
- Examples: `import { Button } from "@/components/ui/button"`, `import { useToast } from "@/hooks/use-toast"`
- Server uses relative paths: `from "./routes"`, `from "./config"`

## Error Handling

**Patterns:**
- Try-catch for async operations with typed error: `catch (e: any)` or `catch (error: any)`
- Supabase errors extracted with destructuring: `const { data, error } = await supabase...`
- Response status checks: `if (!res.ok)` with explicit error message construction
- Express middleware error handler at bottom: catches all errors with status/statusCode fallback
- Errors returned as JSON with `{ error: "message" }` or `{ message: "error text" }`
- Status code patterns:
  - 400 for validation errors ("Missing messages array", "No file uploaded")
  - 404 for not found ("Agent not found", "Job not found")
  - 429 for rate limiting ("Rate limit exceeded")
  - 500 for server errors ("Internal Server Error")

**Error Messages:**
- Clear, user-facing strings in response JSON
- Console logging for debugging with timestamps via custom `log()` function
- Errors include context: `${res.status}: ${text}` for fetch failures

## Logging

**Framework:** `console` (built-in Node.js, no external logger)

**Patterns:**
- Custom `log()` function in `server/index.ts` for formatted output with timestamps
- Format: `HH:MM:SS [source] message`
- Middleware logs API requests: `${req.method} ${path} ${res.statusCode} in ${duration}ms`
- Response body logged for debugging: `:: ${JSON.stringify(capturedJsonResponse)}`
- Errors logged with `console.error()`: "Internal Server Error:", full error object
- Business logic logs with `console.log()`: agent loads, capability requests, email sends
- No structured logging (JSON, fields) - plain text only

## Comments

**When to Comment:**
- Side effects in reducer: `// ! Side effects ! - This could be extracted into a dismissToast() action`
- Configuration notes: `// @replit: no hover, and add primary border` (UI component customizations)
- Important sequencing: `// importantly only setup vite in development and after setting up other routes`
- Section headers with dashes for readability: `// ─── Health Check ───`, `// ─── Agent Routes ───`

**JSDoc/TSDoc:**
- Not used in this codebase (no `@param`, `@returns`, `@example` patterns)
- Type information conveyed through TypeScript types directly
- Comments focus on "why" not "what" (type provides "what")

## Function Design

**Size:**
- Functions range from 10-50 lines typically
- Largest function is route handler `registerRoutes()` at ~600 lines (contains many nested route definitions)
- Route handlers are inline rather than extracted

**Parameters:**
- Destructured objects preferred: `{ agentId, classification, userMessage }`
- Typed parameters: `req: Request`, `res: Response`, `httpServer: Server`
- Optional parameters: `source = "express"` with default values
- Callback functions for React hooks: `(state) => void`, `(open) => {...}`

**Return Values:**
- Explicit returns in if branches: `return res.status(404).json({ error: "..." })`
- Promise returns for async functions: `Promise<Server>`, `Promise<Response>`
- React components return JSX elements
- Utility functions return typed values: `boolean` for rate limiting, `string` for IDs

## Module Design

**Exports:**
- Named exports: `export function registerRoutes()`, `export const config = { ... }`
- Default exports for React components: `export default App`
- Mixed for hooks: `export { useToast, toast }` (both named exports)
- Single default export from config: `export const config = { ... }`

**Barrel Files:**
- Used selectively for UI components re-exported from `components/ui/`
- No index.ts aggregation files in main source (imports are direct)
- Shared utilities imported directly: `from "@/lib/utils"`, `from "@/lib/queryClient"`

**Module Pattern:**
- CommonJS `require()` in server-side dynamic loading: `loadModule()`
- ES Modules for TypeScript and React files
- Mixed module system (CJS for agents, ESM for app) managed by build tool

## Specific Patterns

**Rate Limiting:**
- Map-based with IP key: `const rateLimiter = new Map<string, number[]>()`
- Sliding window approach: track timestamps, filter stale entries
- Clean up periodic job: `setInterval()` every 60s

**Async/Await:**
- All async operations await explicitly: `const response = await anthropic.messages.create()`
- Destructuring Supabase responses: `const { data, error } = await supabase...`
- Fetch API wrapped in utility: `apiRequest(method, url, data)`
- Try-catch at handler level, not per operation

**Validation:**
- Zod schemas for request validation: `const uuidSchema = z.string().uuid("Invalid job ID format")`
- Runtime type checking: `if (!body.messages || !Array.isArray(body.messages))`
- Property existence checks: `if (!agent)` before access

**State Management (Client):**
- useReducer pattern in `use-toast.ts` with discriminated union actions
- Local state with `useState()` for UI interactions
- React Query for server state: `useQuery()` hooks with custom `queryClient` configuration
- Global toast dispatch outside React components: `toast()` function with listeners array

---

*Convention analysis: 2026-02-19*
