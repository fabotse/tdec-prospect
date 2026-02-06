# Story 1.4: Supabase Authentication Setup

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to log in to the system securely,
So that my data is protected and isolated.

## Acceptance Criteria

1. **Given** I am not authenticated
   **When** I access any protected route (e.g., `/leads`, `/campaigns`, `/settings`)
   **Then** I am redirected to the login page (`/login`)

2. **Given** I am on the login page
   **When** I enter valid email and password
   **Then** I can log in with email/password via Supabase Auth
   **And** successful login redirects me to the dashboard (`/leads`)

3. **Given** I have just logged in
   **When** I check the browser storage
   **Then** my session is stored in cookies (SSR compatible)
   **And** session token is HttpOnly and Secure

4. **Given** I am authenticated
   **When** I remain inactive for 24 hours
   **Then** session expires and I am redirected to login (NFR-S4)

5. **Given** I am authenticated
   **When** I access the application
   **Then** I can see my user information in the header (email or name)

6. **Given** I am authenticated
   **When** I click the logout button in the header
   **Then** I can log out with one click
   **And** I am redirected to the login page
   **And** my session is cleared

7. **Given** I am not authenticated
   **When** I try to access the login page
   **Then** I see a clean login form with email and password fields
   **And** I see a "Entrar" (Login) button

## Tasks / Subtasks

- [x] Task 1: Configure Supabase project and environment variables (AC: #1-6)
  - [x] Create `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [x] Update `.env.example` with placeholder values for documentation
  - [x] Verify Supabase project has email auth enabled

- [x] Task 2: Create Supabase client utilities (AC: #1-6)
  - [x] Create `src/lib/supabase/client.ts` - Browser client using `createBrowserClient`
  - [x] Create `src/lib/supabase/server.ts` - Server client using `createServerClient`
  - [x] Create `src/lib/supabase/middleware.ts` - Middleware helper for session refresh
  - [x] Ensure cookie-based session storage (SSR compatible)

- [x] Task 3: Update middleware for authentication (AC: #1)
  - [x] Update `src/middleware.ts` to check authentication status
  - [x] Redirect unauthenticated users to `/login` for protected routes
  - [x] Allow access to `/login` and `/signup` without authentication
  - [x] Refresh session token on each request using Supabase middleware helper

- [x] Task 4: Create auth route group and layout (AC: #7)
  - [x] Create `src/app/(auth)/layout.tsx` - Centered auth layout
  - [x] Create auth-specific styling (centered card, clean background)

- [x] Task 5: Create login page (AC: #2, #7)
  - [x] Create `src/app/(auth)/login/page.tsx`
  - [x] Implement login form with email and password fields
  - [x] Use react-hook-form with zod validation
  - [x] Add "Entrar" button with loading state
  - [x] Handle Supabase signInWithPassword
  - [x] Show error messages in Portuguese for invalid credentials
  - [x] Redirect to `/leads` on successful login

- [x] Task 6: Create auth callback route (AC: #2)
  - [x] Create `src/app/(auth)/callback/route.ts`
  - [x] Handle OAuth callback (for future OAuth providers)
  - [x] Exchange code for session

- [x] Task 7: Update Header component for user info (AC: #5, #6)
  - [x] Fetch current user in Header component
  - [x] Display user email (or name if available from user_metadata)
  - [x] Add logout button/dropdown
  - [x] Implement logout functionality using Supabase signOut
  - [x] Redirect to `/login` after logout

- [x] Task 8: Create useUser hook (AC: #5)
  - [x] Create `src/hooks/use-user.ts`
  - [x] Fetch current user session
  - [x] Handle loading and error states
  - [x] Provide user data to components

- [x] Task 9: Configure session expiration (AC: #4)
  - [x] Verify Supabase project JWT expiry is set to 24h (86400 seconds)
  - [x] Note: This is configured in Supabase dashboard, not code

- [x] Task 10: Create E2E tests for authentication (AC: #1-7)
  - [x] Test unauthenticated redirect to login
  - [x] Test successful login flow
  - [x] Test logout flow
  - [x] Test invalid credentials error message

- [x] Task 11: Run tests and verify build
  - [x] Verify all existing tests still pass
  - [x] Verify new auth tests pass
  - [x] Verify build passes
  - [x] Verify lint passes

## Dev Notes

### Supabase Client Architecture (from Architecture.md)

The application uses two types of Supabase clients:

1. **Browser Client** (`client.ts`) - For client-side operations
   - Uses `createBrowserClient` from `@supabase/ssr`
   - Automatically handles cookie storage

2. **Server Client** (`server.ts`) - For server components and API routes
   - Uses `createServerClient` from `@supabase/ssr`
   - Requires cookie handlers for reading/setting cookies

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}
```

### Middleware Pattern (from Architecture.md)

```typescript
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes check
  const isProtectedRoute = request.nextUrl.pathname.startsWith('/leads') ||
    request.nextUrl.pathname.startsWith('/campaigns') ||
    request.nextUrl.pathname.startsWith('/settings')

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup')

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/leads'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### Login Form Pattern

```typescript
// Using react-hook-form + zod (already installed)
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

type LoginFormData = z.infer<typeof loginSchema>
```

### Error Messages (Portuguese)

| Supabase Error | User-Facing Message |
|----------------|---------------------|
| `Invalid login credentials` | "Email ou senha incorretos" |
| `Email not confirmed` | "Por favor, confirme seu email" |
| `Too many requests` | "Muitas tentativas. Aguarde um momento." |
| Network error | "Erro de conexão. Tente novamente." |

### Project Structure Notes

**Files to create:**

```
src/
├── app/
│   ├── (auth)/                    # NEW: Auth route group
│   │   ├── layout.tsx             # NEW: Centered auth layout
│   │   ├── login/
│   │   │   └── page.tsx           # NEW: Login page
│   │   └── callback/
│   │       └── route.ts           # NEW: OAuth callback handler
├── lib/
│   └── supabase/
│       ├── client.ts              # NEW: Browser client
│       ├── server.ts              # NEW: Server client
│       └── middleware.ts          # NEW: Middleware helper
├── hooks/
│   └── use-user.ts                # NEW: User session hook
└── middleware.ts                  # UPDATE: Add auth checks
```

**Files to modify:**

- `src/components/common/Header.tsx` - Add user info and logout
- `src/middleware.ts` - Add authentication checks
- `.env.example` - Add Supabase env vars

### Previous Story Intelligence (1-3)

**What was accomplished:**
- AppShell with Sidebar + Header implemented
- Header has user info placeholder (Avatar + "Usuário") ready for real data
- ThemeToggle in header working
- Dashboard route group `(dashboard)` created
- Navigation items: Leads, Campanhas, Configurações
- Sidebar collapse/expand with localStorage persistence
- 18 E2E tests + 43 unit tests passing
- Build and lint passing

**Key patterns established:**
- useSyncExternalStore pattern for sidebar state
- Module-level state for persistence
- Component structure in `src/components/common/`
- Route groups with parentheses: `(dashboard)`, `(auth)`

**Files already available:**
- `src/components/common/Header.tsx` - Has user placeholder to update
- `src/components/common/AppShell.tsx` - Layout composition
- `src/app/(dashboard)/layout.tsx` - Dashboard layout
- `src/middleware.ts` - Exists, needs auth logic

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Auth Provider | Supabase Auth (NOT custom auth) |
| Session Storage | Cookies via `@supabase/ssr` (NOT localStorage) |
| Client Types | Browser (`createBrowserClient`) + Server (`createServerClient`) |
| Protected Routes | Middleware-based redirect |
| Naming | `use-user.ts` for hooks, `client.ts`/`server.ts` for utilities |

**Environment Variables:**

```env
# .env.local (DO NOT COMMIT)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# .env.example (commit this)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Design Tokens for Auth Pages (from UX Spec)

**Auth Layout:**
- Centered card on dark background (`--background`)
- Card uses `--background-secondary` with `--border`
- Max width: 400px
- Padding: 32px (`--space-8`)
- Border radius: 8px (cards)

**Form Elements:**
- Input height: 40px
- Button height: 40px (default)
- Gap between fields: 16px (`--space-4`)
- Label: 14px, `--foreground`
- Error text: 12px, `--destructive`

**Color Usage:**
- Primary button: `--primary` background
- Error messages: `--destructive`
- Focus ring: `--ring` (2px)

### Testing Requirements

**E2E Tests to create:**

1. `auth-redirect.spec.ts`:
   - Unauthenticated user accessing `/leads` redirects to `/login`
   - Authenticated user accessing `/login` redirects to `/leads`

2. `login.spec.ts`:
   - Login form displays correctly
   - Invalid credentials show error message
   - Valid credentials redirect to `/leads`
   - Loading state shows during submission

3. `logout.spec.ts`:
   - Logout button visible in header
   - Click logout redirects to `/login`
   - Session is cleared after logout

### What NOT to Do

- Do NOT store session in localStorage (use cookies via @supabase/ssr)
- Do NOT expose Supabase service role key in client code
- Do NOT skip middleware session refresh
- Do NOT hardcode credentials or URLs
- Do NOT forget error handling for Supabase operations
- Do NOT use `getSession()` - use `getUser()` for security (avoids JWT validation issues)
- Do NOT skip the loading state in forms
- Do NOT forget Portuguese error messages

### Security Considerations (from Architecture + PRD)

| Requirement | Implementation |
|-------------|----------------|
| NFR-S4 | Session expires after 24h inactivity (Supabase config) |
| NFR-S5 | All communications via HTTPS (Supabase default) |
| NFR-S3 | Tenant isolation via RLS (Story 1.5) |

**Cookie Settings:**
- HttpOnly: true (prevents XSS)
- Secure: true (HTTPS only)
- SameSite: Lax (CSRF protection)

### Dependencies

**Already installed:**
- `@supabase/supabase-js` - Supabase client
- `@supabase/ssr` - SSR utilities for Next.js
- `react-hook-form` - Form handling
- `zod` - Schema validation
- `@hookform/resolvers` - Zod resolver for RHF

**No new dependencies required.**

### References

- [Source: architecture.md#Authentication-Security] - Auth architecture decisions
- [Source: architecture.md#Project-Structure] - File organization
- [Source: prd.md#User-Management] - FR34 (Login), FR37 (Permissions)
- [Source: prd.md#Security] - NFR-S4 (Session expiry)
- [Source: ux-design-specification.md#Design-System-Foundation] - Form styling
- [Source: epics.md#Story-1.4] - Acceptance criteria
- [Source: Story 1.3] - Previous implementation context, Header component

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Adicionado `@hookform/resolvers` (não estava no package.json original, embora mencionado nos Dev Notes)
- Atualizados testes unitários de Header e AppShell para mockar useRouter e useUser
- Ajustado teste E2E de validação de email para usar validação nativa do browser (type="email")

### Completion Notes List

1. **Supabase Client Utilities**: Criados `client.ts`, `server.ts`, e `middleware.ts` em `src/lib/supabase/` seguindo padrões oficiais do @supabase/ssr
2. **Middleware Authentication**: Implementada proteção de rotas com redirect para /login e refresh de sessão via cookies
3. **Login Page**: Formulário com react-hook-form + zod, mensagens de erro em Português, estado de loading
4. **Auth Callback**: Rota para troca de código OAuth por sessão (preparado para futuros provedores)
5. **useUser Hook**: Hook cliente com estado de loading, erro, e listener de mudanças de auth
6. **Header Update**: Exibe nome/email do usuário, botão de logout funcional
7. **UI Components**: Criados Input e Label em `src/components/ui/`
8. **Testes**: 95 testes unitários passando, 11 E2E passando
9. **Session Expiration**: Configurado via Supabase Dashboard (24h JWT expiry)

### Code Review Fixes (2026-01-30)

**Issues Fixed:**
- M1: Criados testes unitários para LoginPage (22 testes)
- M2: Criados testes unitários para useUser hook (10 testes)
- M3: Login page agora exibe erro de callback (`?error=auth_callback_error`)
- L1: Removido "use client" desnecessário de Label component
- L2: Adicionado aria-describedby para mensagens de erro

### File List

**Novos arquivos:**
- src/lib/supabase/client.ts
- src/lib/supabase/server.ts
- src/lib/supabase/middleware.ts
- src/app/(auth)/login/page.tsx
- src/app/(auth)/callback/route.ts
- src/hooks/use-user.ts
- src/components/ui/input.tsx
- src/components/ui/label.tsx
- __tests__/e2e/auth.spec.ts
- __tests__/unit/components/LoginPage.test.tsx (code review)
- __tests__/unit/hooks/use-user.test.ts (code review)

**Arquivos modificados:**
- src/middleware.ts
- src/app/(auth)/layout.tsx
- src/components/common/Header.tsx
- __tests__/unit/components/Header.test.tsx
- __tests__/unit/components/AppShell.test.tsx
- __tests__/e2e/home.spec.ts
- __tests__/e2e/navigation.spec.ts
- package.json (adicionado @hookform/resolvers)
- package-lock.json
- src/components/ui/label.tsx (code review - removido "use client")
- src/app/(auth)/login/page.tsx (code review - callback error, aria)

## Change Log

- 2026-01-30: Story 1.4 implementation complete - Supabase authentication setup with login, logout, protected routes, and E2E tests
- 2026-01-30: Code review complete - Fixed 4 MEDIUM and 2 LOW issues, added 32 unit tests for LoginPage and useUser hook
