# Story 1.3: Application Shell with Navigation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a clean sidebar navigation,
So that I can easily navigate between main areas of the application.

## Acceptance Criteria

1. **Given** I am on the application
   **When** the page loads
   **Then** I see a sidebar (240px width) with navigation items

2. **Given** the sidebar is visible
   **When** I look at the navigation items
   **Then** the sidebar shows icons + labels for: Leads, Campanhas, Configurações

3. **Given** the sidebar is expanded
   **When** I click the collapse button
   **Then** the sidebar can collapse to 64px (icons only)
   **And** the collapse state persists via localStorage

4. **Given** the application shell exists
   **When** I view the header area
   **Then** there is a header (64px height) with user info placeholder and theme toggle

5. **Given** I am navigating the app
   **When** I click on a navigation item
   **Then** the active route is visually highlighted (left border primary color, background tertiary)

6. **Given** I am using keyboard navigation
   **When** I press Tab through the sidebar
   **Then** navigation is keyboard accessible with visible focus states

## Tasks / Subtasks

- [x] Task 1: Create Sidebar component (AC: #1, #2, #5)
  - [x] Create `src/components/common/Sidebar.tsx`
  - [x] Implement 240px fixed width sidebar on the left
  - [x] Add navigation items: Leads (Users icon), Campanhas (Send icon), Configurações (Settings icon)
  - [x] Use Next.js `Link` component for navigation
  - [x] Implement active route detection using `usePathname()`
  - [x] Style active item with left border `--primary` and bg `--background-tertiary`
  - [x] Use lucide-react icons (already installed from Story 1.2)

- [x] Task 2: Implement sidebar collapse functionality (AC: #3)
  - [x] Add collapse/expand toggle button (ChevronLeft/ChevronRight icon)
  - [x] Create collapsed state (64px width, icons only)
  - [x] Animate transition (200ms ease-out)
  - [x] Persist collapse state to localStorage
  - [x] Ensure icons remain visible and centered in collapsed state

- [x] Task 3: Create Header component (AC: #4)
  - [x] Create `src/components/common/Header.tsx`
  - [x] Implement 64px fixed height header
  - [x] Add user info placeholder (Avatar + name) on the right
  - [x] Move ThemeToggle to header (from current demo position)
  - [x] Style with bottom border `--border`

- [x] Task 4: Create AppShell layout component (AC: #1, #4)
  - [x] Create `src/components/common/AppShell.tsx`
  - [x] Compose Sidebar + Header + Content area
  - [x] Main content area fills remaining space
  - [x] Ensure proper z-index layering

- [x] Task 5: Create dashboard layout (AC: #1)
  - [x] Create `src/app/(dashboard)/layout.tsx`
  - [x] Wrap with AppShell component
  - [x] Create placeholder pages for navigation targets

- [x] Task 6: Create placeholder pages for navigation
  - [x] Create `src/app/(dashboard)/leads/page.tsx` with "Leads" title
  - [x] Create `src/app/(dashboard)/campaigns/page.tsx` with "Campanhas" title
  - [x] Create `src/app/(dashboard)/settings/page.tsx` with "Configurações" title

- [x] Task 7: Ensure keyboard accessibility (AC: #6)
  - [x] Add proper `tabIndex` to navigation items
  - [x] Ensure focus states are visible (use `--ring` token)
  - [x] Test Tab navigation through sidebar
  - [x] Add `role="navigation"` and `aria-label` to sidebar

- [x] Task 8: Update root page redirect
  - [x] Update `src/app/page.tsx` to redirect to `/leads` or show dashboard

- [x] Task 9: Run tests and verify build
  - [x] Create E2E tests for navigation
  - [x] Verify build passes
  - [x] Verify lint passes

## Dev Notes

### Layout Structure

The application shell follows this structure (from Architecture):

```
┌────────────────────────────────────────────────────────┐
│                    Header (64px)                        │
│  [Logo/Brand]                    [User Info] [Toggle]   │
├──────────┬─────────────────────────────────────────────┤
│          │                                              │
│ Sidebar  │              Main Content                    │
│ (240px)  │                                              │
│          │                                              │
│ [Leads]  │                                              │
│ [Camp.]  │                                              │
│ [Config] │                                              │
│          │                                              │
│          │                                              │
│ [<<]     │                                              │
└──────────┴─────────────────────────────────────────────┘
```

### Component Dimensions (from UX Spec)

| Element | Value |
|---------|-------|
| Sidebar width | 240px (expanded), 64px (collapsed) |
| Header height | 64px |
| Nav item height | 44px (for touch target compliance) |
| Border radius | 6px (default) |
| Transition duration | 200ms |

### Color Tokens to Use (from Story 1.2)

| Element | Token | Purpose |
|---------|-------|---------|
| Sidebar background | `--background-secondary` | Elevated surface |
| Active nav item bg | `--background-tertiary` | Highlight |
| Active nav border | `--primary` | Left accent (3px) |
| Text primary | `--foreground` | Nav labels |
| Text muted | `--foreground-muted` | Inactive items |
| Borders | `--border` | Dividers |
| Focus ring | `--ring` | Keyboard navigation |

### Navigation Items

| Item | Path | Icon (lucide-react) |
|------|------|---------------------|
| Leads | `/leads` | `Users` |
| Campanhas | `/campaigns` | `Send` |
| Configurações | `/settings` | `Settings` |

### Typography for Navigation

- Nav item labels: 14px (Body), weight 500
- Section headers (if any): 12px (Caption), weight 500, `--foreground-muted`

### Animation Specifications

**Sidebar Collapse/Expand:**
- Duration: 200ms
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out)
- Properties to animate: `width`
- Labels should fade out/in with opacity

**Active State Transition:**
- Duration: 150ms
- Properties: `background-color`, `border-color`

### Project Structure Notes

**Files to create:**

```
src/
├── app/
│   ├── (dashboard)/           # NEW: Route group for authenticated pages
│   │   ├── layout.tsx         # NEW: Dashboard layout with AppShell
│   │   ├── leads/
│   │   │   └── page.tsx       # NEW: Leads placeholder
│   │   ├── campaigns/
│   │   │   └── page.tsx       # NEW: Campaigns placeholder
│   │   └── settings/
│   │       └── page.tsx       # NEW: Settings placeholder
│   └── page.tsx               # UPDATE: Redirect to /leads
├── components/
│   └── common/
│       ├── Sidebar.tsx        # NEW: Main sidebar component
│       ├── Header.tsx         # NEW: Top header component
│       ├── AppShell.tsx       # NEW: Layout composition
│       ├── ThemeProvider.tsx  # EXISTS: From Story 1.2
│       └── ThemeToggle.tsx    # EXISTS: Move to Header
```

### Previous Story Intelligence (1.2)

**What was accomplished:**
- Complete design token system in `globals.css`
- Dark mode as default with light mode toggle
- ThemeProvider and ThemeToggle components created
- Inter and JetBrains Mono fonts configured
- lucide-react installed for icons
- shadcn Button component available
- Build and lint passing

**Key learnings:**
- Tailwind v4 uses CSS-based configuration in `globals.css`
- Theme toggle uses localStorage for persistence
- Inline script in layout.tsx prevents flash of wrong theme
- Components use HSL color format via CSS variables

**Files already available:**
- `src/components/common/ThemeProvider.tsx` - Theme context
- `src/components/common/ThemeToggle.tsx` - Theme toggle button
- `src/components/ui/button.tsx` - shadcn Button
- `src/app/globals.css` - Complete design tokens
- `src/app/layout.tsx` - Root layout with ThemeProvider

### Architecture Compliance

**MUST Follow:**
- Use semantic HTML (`nav`, `header`, `main`, `aside`)
- Component names in PascalCase
- File names match component names
- Use CSS variables for all colors (not hardcoded)
- Follow mobile-first but desktop is P0
- Navigation must be accessible (WCAG 2.1 AA)

**Route Groups:**
- `(dashboard)` route group for authenticated pages
- Parentheses prevent the folder name from appearing in URL
- All dashboard routes share the AppShell layout

**Naming Conventions:**
- Components: PascalCase (`Sidebar.tsx`, `Header.tsx`)
- Hooks: use + PascalCase (`useSidebar`)
- CSS Variables: kebab-case (`--background-secondary`)

### Testing Requirements

After implementation, verify:
1. Sidebar renders at 240px width on load
2. Collapse button reduces sidebar to 64px
3. Collapse state persists after page reload
4. Navigation links work and highlight active route
5. Header shows theme toggle and user placeholder
6. Tab navigation works through all interactive elements
7. Focus states are visible with correct ring color
8. Responsive behavior (sidebar collapses on smaller screens - stretch goal)

### What NOT to Do

- Do NOT use absolute positioning for main content (use flexbox)
- Do NOT hardcode colors (use CSS variables)
- Do NOT forget localStorage for collapse state persistence
- Do NOT skip keyboard accessibility
- Do NOT use inline styles (use Tailwind classes)
- Do NOT create new CSS files (use globals.css tokens + Tailwind)
- Do NOT forget to add aria-labels for accessibility

### External Dependencies

**Already installed (from Story 1.2):**
- `lucide-react` - Icons for navigation items

**No new dependencies required.**

### References

- [Source: ux-design-specification.md#Sidebar] - Sidebar dimensions and behavior
- [Source: ux-design-specification.md#Navigation-Patterns] - Navigation patterns
- [Source: ux-design-specification.md#Color-System] - Color tokens
- [Source: architecture.md#Project-Structure] - File organization
- [Source: architecture.md#Implementation-Patterns] - Naming conventions
- [Source: Story 1.2] - Previous implementation context, available components

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- Implemented complete application shell with sidebar navigation (240px expanded, 64px collapsed)
- Created Header component with 64px fixed height, user info placeholder, and theme toggle
- AppShell uses useSyncExternalStore for sidebar state to avoid lint errors with setState in effects
- Root page redirects to /leads via Next.js redirect function
- Dashboard route group (dashboard) created with shared layout using AppShell
- Three placeholder pages: /leads, /campaigns, /settings
- Sidebar collapse state persists via localStorage key "sidebar-collapsed"
- All navigation items have keyboard accessibility with visible focus states using --ring token
- 18 E2E tests pass covering sidebar, header, navigation, and theme functionality
- 43 unit tests added for Sidebar, Header, AppShell components (code review fix)
- Build and lint pass successfully
- Tooltips added for collapsed sidebar navigation items (code review fix)
- Module-level state pattern documented in AppShell.tsx (code review fix)

### File List

**New Files:**
- src/components/common/Sidebar.tsx
- src/components/common/Header.tsx
- src/components/common/AppShell.tsx
- src/app/(dashboard)/layout.tsx
- src/app/(dashboard)/leads/page.tsx
- src/app/(dashboard)/campaigns/page.tsx
- src/app/(dashboard)/settings/page.tsx
- __tests__/e2e/navigation.spec.ts
- __tests__/unit/components/Sidebar.test.tsx (code review fix)
- __tests__/unit/components/Header.test.tsx (code review fix)
- __tests__/unit/components/AppShell.test.tsx (code review fix)

**Modified Files:**
- src/app/page.tsx (redirect to /leads)
- src/app/globals.css (sidebar tokens added)
- src/app/layout.tsx (ThemeProvider integration)
- src/middleware.ts (route configuration)
- package.json (dependencies)
- package-lock.json (lock file)
- __tests__/e2e/home.spec.ts (updated for redirect behavior)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status update)

