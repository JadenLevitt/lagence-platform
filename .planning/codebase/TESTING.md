# Testing Patterns

**Analysis Date:** 2026-02-19

## Test Framework

**Status:** No testing framework configured.

**What's Not Present:**
- No Jest, Vitest, Mocha, or other test runner in dependencies
- No test configuration files (jest.config.ts, vitest.config.ts, etc.)
- No test command in package.json (only `dev`, `build`, `start`, `check`)
- No test files in source directories (`*.test.ts`, `*.test.tsx`, `*.spec.ts`)

**Current Validation:**
- TypeScript compiler (`tsc`) is the only validator: `npm run check`
- Run with `npm run check` for type checking
- No runtime test execution

**Static Analysis Only:**
- TypeScript strict mode: `"strict": true`
- Type checking on all code: `"noEmit": true` in tsconfig.json
- Import extension support for validation: `"allowImportingTsExtensions": true`

## Build & Development

**Run Commands:**
```bash
npm run dev              # Development server with hot reload (tsx + doppler)
npm run build           # Build TypeScript and client assets
npm run check           # Run TypeScript compiler (type checking only)
npm start              # Production server (requires build first)
```

**Development Setup:**
- Server: `tsx` loader for direct TypeScript execution
- Client: Vite with React plugin for hot reload
- Dual mode: separate client (Vite) and server (tsx/esbuild) pipelines
- Environment: `NODE_ENV` controls Vite setup vs static file serving

## Code Quality Tools

**TypeScript Configuration:**
- Strict mode enabled for type safety
- Module resolution: bundler (dual ESM/CJS)
- Target: ESNext
- No declaration files emitted (`noEmit: true`)
- Incremental builds enabled for performance
- Build info stored in `node_modules/.tsbuildinfo`

**What's Missing:**
- No ESLint configuration
- No Prettier configuration
- No automated formatting or linting in build
- No pre-commit hooks configured
- Manual code review only

## Manual Testing Approach

**Current State:**
This codebase relies on manual testing and TypeScript type checking. There is no automated test suite.

**Observable Testing Patterns (if tests existed):**

### 1. Rate Limiting Logic

```typescript
// This would test the sliding window rate limiter in routes.ts
// Structure if testing existed:
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW;
  // ... implementation
  return requests.length < RATE_LIMIT;
}
// Test: should allow request within limit, reject when exceeded
// Test: should clean stale entries outside window
```

### 2. Error Handling

```typescript
// Response handling pattern (no formal tests):
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  if (res.headersSent) return next(err);
  return res.status(status).json({ message });
});
```

### 3. Async Operations

```typescript
// Supabase error handling (no formal tests):
async function sendCapabilityChangeNotification({
  agentId,
  classification,
  userMessage,
}) {
  const { data, error } = await supabase
    .from("capability_proposals")
    .insert({ /* ... */ });

  if (error) {
    console.log(`Failed to save: ${error.message}`);
    return { success: false, error: error.message };
  }
  return { success: true, proposalId: data.id };
}
// If testing: mock Supabase, verify error and success paths
```

### 4. Type Safety (via TypeScript)

```typescript
// Types are validated at compile time:
interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // Type checking ensures props match ButtonProps
  }
);
// Type errors caught during `npm run check`
```

## Testing Gaps

**Not Tested:**
- Rate limiting logic (`checkRateLimit()` function)
- Error handling paths in route handlers
- Supabase integration (create, query, insert operations)
- API request/response serialization
- Component rendering and interactions
- State management (reducer logic in `use-toast.ts`)
- Toast dispatch and listener callbacks
- Anthropic API integration
- Email notification flow (`sendCapabilityChangeNotification`)
- File upload and validation
- Dynamic agent loading and hot-reload

**Critical Areas Without Coverage:**
- `server/routes.ts`: 1,353 lines, handles all API endpoints, no tests
- `client/src/pages/home.tsx`: 857 lines, complex page logic, no tests
- `use-toast.ts`: 191 lines, reducer logic, no tests

## Recommended Testing Structure (if implemented)

**Unit Tests:**
- Location: `__tests__/` directory parallel to source, or `.test.ts` co-located
- Framework: Vitest (lightweight, Vite-integrated) or Jest
- Pattern: Arrange-Act-Assert for each function
- Utilities: Mock Supabase client, Anthropic SDK

**Integration Tests:**
- Test API endpoints with Express test utility (supertest)
- Mock Supabase database interactions
- Verify request/response contracts

**Component Tests:**
- React Testing Library for UI components
- Mock hooks and external dependencies
- Focus on user interactions, not implementation

**Coverage Target:** Establish baseline coverage requirement (e.g., 60%+)

## Development Practices

**Type Safety:**
- Run `npm run check` before committing
- Use `strict: true` TypeScript setting
- All external data has explicit types

**Debugging:**
- Console logging in development (custom `log()` function)
- Browser DevTools for client-side
- Server logs include request duration and response body

**Code Review:**
- Manual code review only (no automated checks)
- TypeScript compilation as first gate

---

*Testing analysis: 2026-02-19*
