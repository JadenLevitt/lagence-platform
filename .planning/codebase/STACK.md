# Technology Stack

**Analysis Date:** 2026-02-19

## Languages

**Primary:**
- TypeScript 5.6.3 - Full stack (server, client, shared code)
- JavaScript (CommonJS) - Legacy agent/capability modules in `agents/`, `core/`, `shared-capabilities/`

**Secondary:**
- SQL - Supabase migrations in `supabase/migrations/`

## Runtime

**Environment:**
- Node.js >= 18.0.0 (currently v22.22.0)

**Package Manager:**
- npm 10.9.4
- Lockfile: `package-lock.json` present

## Frameworks

**Core Framework:**
- Express 5.0.1 - HTTP server (`server/index.ts`, `server/routes.ts`)

**Frontend Framework:**
- React 19.2.0 - UI components and pages
- Vite 7.1.9 - Dev server and build tool
- Wouter 3.3.5 - Client-side routing

**UI Components:**
- shadcn/ui components (via Radix UI primitives)
- 15+ @radix-ui/* packages (accordion, dialog, dropdown, tabs, etc.)
- Lucide React 0.545.0 - Icons

**Forms & State:**
- React Hook Form 7.66.0 - Form state management
- @tanstack/react-query 5.60.5 - Server state management (caching, sync)

**Styling:**
- Tailwind CSS 4.1.14 - Utility-first CSS
- Tailwind Merge 3.3.1 - Conditional Tailwind class merging

**Build & Dev:**
- @tailwindcss/vite 4.1.14 - Tailwind integration for Vite
- Vite React Plugin 5.0.4 - JSX support in Vite
- PostCSS 8.5.6 - CSS transformations
- Autoprefixer 10.4.21 - Vendor prefixing
- esbuild 0.25.0 - Fast bundler (Vite uses this)

**Testing:**
- Playwright 1.40.0 - E2E testing

## Key Dependencies

**Critical:**
- @anthropic-ai/sdk 0.71.2 - Claude AI integration
- @supabase/supabase-js 2.93.2 - Database client and auth
- multer 2.0.2 - File upload middleware

**UI & Interaction:**
- Framer Motion 12.23.24 - Animation library
- Sonner 2.0.7 - Toast notifications
- Recharts 2.15.4 - Chart/data visualization
- Embla Carousel React 8.6.0 - Carousel component
- React Resizable Panels 2.1.9 - Resizable UI panels
- Vaul 1.1.2 - Drawer/modal library

**Date & Time:**
- date-fns 3.6.0 - Date manipulation
- react-day-picker 9.11.1 - Calendar component

**Data & Validation:**
- Zod 3.25.76 - TypeScript-first schema validation
- zod-validation-error 3.4.0 - Better Zod error messages

**Utils:**
- class-variance-authority 0.7.1 - Variant style system (CVA pattern)
- clsx 2.1.1 - Conditional className utility
- input-otp 1.4.2 - OTP input component
- dotenv 17.2.3 - Environment variable loading

## Configuration

**Environment:**
- Configuration loaded from environment variables via `dotenv`
- Key config: `server/config.ts` exports `supabaseUrl`, `supabaseServiceKey`, `bearerToken`, `googleClientId`, `port`
- See INTEGRATIONS.md for required env vars

**Build:**
- TypeScript compiler: `tsconfig.json` with:
  - Strict mode enabled
  - Path aliases: `@/*` → `client/src/`, `@shared/*` → `shared/`
  - No emit (type checking only)
  - Module: ESNext, target: latest
- Vite build config: `vite.config.ts`
  - React plugin + Tailwind CSS plugin
  - Build output: `dist/public/`
  - Root: `client/` directory
- PostCSS: `postcss.config.js` with Tailwind and autoprefixer
- shadcn/ui config: `components.json`
  - Style: New York
  - Icons: Lucide
  - Base color: neutral
  - Aliases for quick imports

**Scripts:**
- `npm run dev` - Development: `doppler run -- tsx server/index.ts` (requires Doppler secrets)
- `npm run build` - TypeScript custom build via `script/build.ts`
- `npm start` - Production: `node dist/index.cjs`
- `npm run check` - Type checking: `tsc`

## Platform Requirements

**Development:**
- Node.js >= 18.0.0
- npm or compatible package manager
- Doppler CLI (for secrets in dev)

**Production:**
- Node.js >= 18.0.0
- Environment variables configured (see INTEGRATIONS.md)
- Supabase project with migrations applied
- Build artifacts at `dist/index.cjs` and `dist/public/`

---

*Stack analysis: 2026-02-19*
