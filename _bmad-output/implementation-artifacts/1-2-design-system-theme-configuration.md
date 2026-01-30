# Story 1.2: Design System & Theme Configuration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the application to have a polished dark mode interface,
So that I have a premium visual experience.

## Acceptance Criteria

1. **Given** the project is initialized
   **When** I access the application
   **Then** I see the dark mode theme as default (background #070C1B)

2. **Given** the theme system is configured
   **When** I inspect the CSS
   **Then** CSS custom properties are configured for all design tokens

3. **Given** the typography is configured
   **When** I view any text in the application
   **Then** typography uses Inter (primary) and JetBrains Mono (code)

4. **Given** the spacing system is configured
   **When** I inspect component layouts
   **Then** spacing follows the 4px base scale (4, 8, 12, 16, 24, 32, 48, 64)

5. **Given** the border radius system is configured
   **When** I view UI elements
   **Then** border radius follows the specification (6px default, 8px cards, 12px modals)

6. **Given** the theme toggle is implemented
   **When** I click the theme toggle
   **Then** light mode toggle is available with localStorage persistence
   **And** the theme transitions smoothly (200ms)

## Tasks / Subtasks

- [x] Task 1: Configure design tokens in globals.css (AC: #1, #2)
  - [x] Define dark mode color tokens as CSS custom properties
  - [x] Define light mode color tokens
  - [x] Set dark mode as default (`:root` = dark, `.light` class for light mode)
  - [x] Configure background colors: `--background`, `--background-secondary`, `--background-tertiary`
  - [x] Configure foreground colors: `--foreground`, `--foreground-muted`
  - [x] Configure border colors: `--border`, `--border-hover`, `--input`, `--ring`
  - [x] Configure semantic colors: `--primary`, `--secondary`, `--accent`, `--muted`
  - [x] Configure status colors: `--success`, `--warning`, `--destructive`
  - [x] Configure glow effects for premium feel

- [x] Task 2: Configure typography system (AC: #3)
  - [x] Install Inter and JetBrains Mono fonts (Google Fonts or local)
  - [x] Configure font-family tokens in CSS
  - [x] Define type scale tokens (display, h1, h2, h3, body, body-small, caption, mono)
  - [x] Set line-height values for each scale
  - [x] Configure font-weight variables

- [x] Task 3: Configure spacing system (AC: #4)
  - [x] Define spacing scale tokens (space-1 through space-16)
  - [x] Ensure all values follow 4px base (4, 8, 12, 16, 24, 32, 48, 64)
  - [x] Update Tailwind theme extension if needed

- [x] Task 4: Configure border radius system (AC: #5)
  - [x] Define radius tokens: `--radius` (6px), `--radius-md` (8px), `--radius-lg` (12px)
  - [x] Configure shadcn components.json with correct radius

- [x] Task 5: Create ThemeProvider component (AC: #6)
  - [x] Create `src/components/common/ThemeProvider.tsx`
  - [x] Implement theme context with `useTheme` hook
  - [x] Add localStorage persistence for theme preference
  - [x] Respect `prefers-color-scheme` as initial default
  - [x] Add smooth transition (200ms) when switching themes

- [x] Task 6: Create ThemeToggle component (AC: #6)
  - [x] Create `src/components/common/ThemeToggle.tsx`
  - [x] Use shadcn Button component as base
  - [x] Add sun/moon icons for visual indication
  - [x] Connect to ThemeProvider context

- [x] Task 7: Update root layout with ThemeProvider
  - [x] Wrap app with ThemeProvider in `src/app/layout.tsx`
  - [x] Ensure no flash of wrong theme on initial load
  - [x] Add theme toggle to test location (temporary)

- [x] Task 8: Verify design tokens integration with shadcn/ui
  - [x] Test Button component renders with correct colors
  - [x] Test Card component uses correct background/border
  - [x] Verify focus rings use `--ring` token
  - [x] Verify disabled states use correct opacity

## Dev Notes

### Color System (from UX Specification)

**Dark Mode Tokens (Default):**

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#070C1B` | Main application background |
| `--background-secondary` | `#0D1425` | Cards, elevated surfaces |
| `--background-tertiary` | `#141D2F` | Hover states, sidepanels |
| `--foreground` | `#F8FAFC` | Primary text |
| `--foreground-muted` | `#94A3B8` | Secondary text |
| `--border` | `#1E293B` | Subtle borders |
| `--border-hover` | `#334155` | Borders on hover |
| `--input` | `#1E293B` | Input borders |
| `--ring` | `#6366F1` | Focus ring |

**Semantic Colors:**

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#6366F1` | Primary actions, CTAs (indigo) |
| `--primary-hover` | `#818CF8` | Primary on hover |
| `--primary-foreground` | `#FFFFFF` | Text on primary |
| `--secondary` | `#1E293B` | Secondary backgrounds |
| `--secondary-foreground` | `#F8FAFC` | Text on secondary |
| `--muted` | `#1E293B` | Muted backgrounds |
| `--muted-foreground` | `#94A3B8` | Secondary/placeholder text |
| `--accent` | `#8B5CF6` | Special highlights, AI (violet) |
| `--accent-foreground` | `#FFFFFF` | Text on accent |

**Status Colors:**

| Token | Value | Usage |
|-------|-------|-------|
| `--success` | `#22C55E` | Confirmations, successful actions |
| `--success-muted` | `#166534` | Success badge background |
| `--warning` | `#F59E0B` | Alerts, attention needed |
| `--warning-muted` | `#92400E` | Warning badge background |
| `--destructive` | `#EF4444` | Errors, destructive actions |
| `--destructive-muted` | `#991B1B` | Error badge background |

**Glow Effects (Premium Feel):**

| Effect | Value | Usage |
|--------|-------|-------|
| `--glow-primary` | `0 0 20px rgba(99, 102, 241, 0.3)` | Glow on primary buttons |
| `--glow-accent` | `0 0 20px rgba(139, 92, 246, 0.3)` | Glow on AI elements |

### Light Mode Tokens (Alternative)

| Token | Dark Value | Light Value |
|-------|------------|-------------|
| `--background` | `#070C1B` | `#FFFFFF` |
| `--background-secondary` | `#0D1425` | `#F8FAFC` |
| `--background-tertiary` | `#141D2F` | `#F1F5F9` |
| `--foreground` | `#F8FAFC` | `#0F172A` |
| `--foreground-muted` | `#94A3B8` | `#64748B` |
| `--border` | `#1E293B` | `#E2E8F0` |
| `--border-hover` | `#334155` | `#CBD5E1` |

### Typography System

**Font Families:**
- Primary: `Inter` (sans-serif)
- Monospace: `JetBrains Mono`

**Type Scale:**

| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Display | 32px | 600 | 1.2 | Page titles |
| H1 | 24px | 600 | 1.3 | Section titles |
| H2 | 20px | 600 | 1.4 | Subtitles |
| H3 | 16px | 500 | 1.4 | Card titles |
| Body | 14px | 400 | 1.5 | Main text |
| Body Small | 13px | 400 | 1.5 | Secondary text |
| Caption | 12px | 400 | 1.4 | Labels, captions |
| Mono | 13px | 400 | 1.5 | Code, data |

### Spacing System

**Base unit:** 4px

| Token | Value | Common Usage |
|-------|-------|--------------|
| `--space-1` | 4px | Minimal gaps |
| `--space-2` | 8px | Button internal padding |
| `--space-3` | 12px | Gap between related elements |
| `--space-4` | 16px | Card padding |
| `--space-6` | 24px | Gap between sections |
| `--space-8` | 32px | Margin between blocks |
| `--space-12` | 48px | Large area padding |
| `--space-16` | 64px | Page padding |

### Border Radius System

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | 6px | Default (buttons, inputs) |
| `--radius-md` | 8px | Cards |
| `--radius-lg` | 12px | Modals, large containers |

### Component Dimensions (Reference)

| Element | Value |
|---------|-------|
| Sidebar | 240px (collapsed: 64px) |
| Header | 64px height |
| Input height | 40px |
| Button height | 36px (sm), 40px (default), 44px (lg) |

### Form Field Patterns

**Label-Input Spacing:**

| Pattern | Class | Value | Usage |
|---------|-------|-------|-------|
| Label margin-bottom | `mb-2 block` | 8px | Padrão para todos os campos de formulário |
| Field group gap | `space-y-4` | 16px | Espaçamento entre campos do formulário |
| Form section gap | `space-y-6` | 24px | Espaçamento entre seções do formulário |

**Implementação padrão:**
```tsx
<div className="space-y-4">
  <Label htmlFor="field" className="mb-2 block">Label</Label>
  <Input id="field" />
</div>
```

**Princípios:**
- Labels sempre com `mb-2 block` para espaçamento consistente de 8px
- Campos agrupados com `space-y-4` entre si
- Seções maiores separadas com `space-y-6`
- Manter visual minimalista com breathing room adequado

### Project Structure Notes

**Files to create/modify:**

```
src/
├── app/
│   ├── globals.css          # UPDATE: Add all design tokens
│   └── layout.tsx           # UPDATE: Add ThemeProvider, fonts
├── components/
│   └── common/
│       ├── ThemeProvider.tsx  # NEW: Theme context provider
│       └── ThemeToggle.tsx    # NEW: Theme toggle button
└── lib/
    └── utils.ts             # EXISTS: May need cn() updates
```

### Previous Story Intelligence (1-1)

**What was accomplished:**
- Next.js 16.1.6 + React 19 initialized
- Tailwind v4 configured (uses CSS-based config, not tailwind.config.ts)
- shadcn/ui initialized with new-york style, neutral base color
- Dark mode class already added to `<html>` element in root layout
- `components.json` exists with CSS variables enabled
- `globals.css` exists with basic shadcn theme tokens

**Key learnings:**
- Tailwind v4 uses CSS-based configuration in `globals.css`, NOT `tailwind.config.ts`
- shadcn/ui components already use CSS variables format `hsl(var(--token))`
- The existing globals.css has shadcn default tokens that need to be updated

**Files already created:**
- `src/app/globals.css` - needs token updates
- `src/app/layout.tsx` - needs ThemeProvider wrapper
- `src/lib/utils.ts` - has cn() utility
- `components.json` - shadcn configuration

### Architecture Compliance

**MUST Follow:**
- Use CSS custom properties for all design tokens
- shadcn/ui components must work with new tokens
- Theme toggle must persist to localStorage
- Dark mode MUST be the default
- All colors in HSL format for shadcn compatibility

**Naming Conventions:**
- Components: PascalCase (`ThemeProvider.tsx`, `ThemeToggle.tsx`)
- CSS Variables: kebab-case (`--background`, `--foreground-muted`)
- Hooks: use + PascalCase (`useTheme`)

### Testing Requirements

After implementation, verify:
1. Application loads with dark theme by default
2. All text is readable (contrast ratio 7:1+)
3. Theme toggle switches between dark/light
4. Theme preference persists after page reload
5. No flash of wrong theme on initial load
6. shadcn Button renders correctly in both themes
7. Focus states visible with correct ring color

### What NOT to Do

- Do NOT create a separate `tailwind.config.ts` for colors (Tailwind v4 uses CSS)
- Do NOT use RGB format (use HSL for shadcn compatibility)
- Do NOT forget the transition animation when switching themes
- Do NOT make light mode the default
- Do NOT skip localStorage persistence
- Do NOT install next-themes if not needed (simple context is sufficient)

### References

- [Source: ux-design-specification.md#Color-System] - Complete color tokens
- [Source: ux-design-specification.md#Typography-System] - Font specifications
- [Source: ux-design-specification.md#Spacing-Layout-Foundation] - Spacing scale
- [Source: ux-design-specification.md#Dual-Theme-System] - Theme toggle requirements
- [Source: architecture.md#Implementation-Patterns] - Naming conventions
- [Source: Story 1.1] - Previous implementation context

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - No issues encountered during implementation.

### Completion Notes List

- ✅ Implemented complete design token system in globals.css with dark mode as default
- ✅ Configured HSL color format for shadcn/ui compatibility
- ✅ Installed Inter and JetBrains Mono fonts via next/font/google
- ✅ Created typography scale with CSS custom properties and utility classes
- ✅ Implemented 4px-based spacing system (space-1 through space-16)
- ✅ Configured border radius tokens (6px default, 8px cards, 12px modals)
- ✅ Created ThemeProvider with useSyncExternalStore for optimal React 19 compatibility
- ✅ Created ThemeToggle component using shadcn Button with sun/moon icons
- ✅ Added inline script in layout.tsx to prevent flash of wrong theme
- ✅ Theme persistence via localStorage with 200ms smooth transition
- ✅ Added demo page showcasing design system components
- ✅ Unit tests: 20 passing (ThemeProvider: 8, ThemeToggle: 5, utils: 7)
- ✅ E2E tests updated for new design system page
- ✅ Build and lint passing

### File List

**Modified:**
- `src/app/globals.css` - Complete design token system with dark/light modes
- `src/app/layout.tsx` - ThemeProvider wrapper, Inter/JetBrains Mono fonts, flash prevention script
- `src/app/page.tsx` - Design system demo page with color palette, typography, buttons
- `__tests__/e2e/home.spec.ts` - Updated E2E tests for design system
- `package.json` - Added lucide-react dependency for theme toggle icons
- `package-lock.json` - Lock file updated with new dependencies
- `src/middleware.ts` - Added eslint-disable for unused request parameter (placeholder for Story 1.5)

**Created:**
- `src/components/common/ThemeProvider.tsx` - Theme context with useTheme hook
- `src/components/common/ThemeToggle.tsx` - Theme toggle button component
- `src/components/ui/button.tsx` - shadcn Button component (via npx shadcn add)
- `__tests__/unit/components/ThemeProvider.test.tsx` - ThemeProvider unit tests
- `__tests__/unit/components/ThemeToggle.test.tsx` - ThemeToggle unit tests

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-30 | Story implementation complete - Design system with theme toggle | Dev Agent (Claude Opus 4.5) |
| 2026-01-30 | Code Review: Fixed lint warning in middleware.ts, removed unnecessary mount detection in ThemeProvider, updated File List with missing entries | Code Review (Claude Opus 4.5) |
