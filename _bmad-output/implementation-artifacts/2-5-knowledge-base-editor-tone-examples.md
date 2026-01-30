# Story 2.5: Knowledge Base Editor - Tone & Examples

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to configure tone of voice and successful email examples,
So that AI generates content matching my communication style.

## Acceptance Criteria

1. **Given** I am on Base de Conhecimento tab
   **When** I access Tom de Voz section
   **Then** I can select from: Formal, Casual, Técnico
   **And** I can add custom tone description
   **And** I can provide writing guidelines

2. **Given** I save tone of voice settings
   **When** I click "Salvar"
   **Then** the data is saved to the knowledge_base table (section="tone")
   **And** I see a success toast: "Tom de voz salvo com sucesso"
   **And** the save button returns to normal state

3. **Given** I reload the page after saving tone settings
   **When** the page loads
   **Then** the previously saved tone settings are populated

4. **Given** I am on Base de Conhecimento tab
   **When** I access Exemplos section
   **Then** I can add multiple email examples that worked well
   **And** each example has fields: subject, body, context

5. **Given** I want to manage email examples
   **When** I interact with the Exemplos section
   **Then** I can add new examples
   **And** I can edit existing examples
   **And** I can remove examples

6. **Given** the knowledge_base_examples table does not exist
   **When** the migration runs
   **Then** the table is created with: id, tenant_id, subject, body, context, created_at, updated_at
   **And** RLS policies ensure tenant isolation

## Tasks / Subtasks

- [x] Task 1: Create knowledge_base_examples database migration (AC: #6)
  - [x] Create `supabase/migrations/00008_create_knowledge_base_examples.sql`
  - [x] Table: id (uuid pk), tenant_id (uuid fk), subject (text), body (text), context (text), created_at, updated_at
  - [x] Index on tenant_id
  - [x] RLS policy: tenant isolation using `get_current_tenant_id()` and `is_admin()` helpers

- [x] Task 2: Create TypeScript types for Tone and Examples (AC: #1, #4)
  - [x] Add types to `src/types/knowledge-base.ts`
  - [x] `TonePreset` type: 'formal' | 'casual' | 'technical'
  - [x] `ToneOfVoice` interface: preset, custom_description, writing_guidelines
  - [x] `EmailExample` interface: id, subject, body, context, created_at, updated_at
  - [x] Zod schemas for validation: `toneOfVoiceSchema`, `emailExampleSchema`

- [x] Task 3: Create server actions for tone and examples (AC: #2, #3, #5)
  - [x] Add to `src/actions/knowledge-base.ts`
  - [x] `getToneOfVoice()` - fetch tone settings
  - [x] `saveToneOfVoice(data)` - save tone settings
  - [x] `getEmailExamples()` - fetch all examples for tenant
  - [x] `createEmailExample(data)` - add new example
  - [x] `updateEmailExample(id, data)` - edit existing example
  - [x] `deleteEmailExample(id)` - remove example
  - [x] Admin role validation in all actions
  - [x] Return `ActionResult<T>` pattern

- [x] Task 4: Create useToneOfVoice hook (AC: #2, #3)
  - [x] Create `src/hooks/use-tone-of-voice.ts`
  - [x] TanStack Query for fetching tone data
  - [x] Mutation for saving with cache update
  - [x] Handle loading/error/success states

- [x] Task 5: Create useEmailExamples hook (AC: #5)
  - [x] Create `src/hooks/use-email-examples.ts`
  - [x] TanStack Query for fetching examples list
  - [x] Mutations for create, update, delete with cache invalidation
  - [x] Optimistic updates for better UX

- [x] Task 6: Create ToneOfVoiceForm component (AC: #1, #2, #3)
  - [x] Create `src/components/settings/ToneOfVoiceForm.tsx`
  - [x] Radio buttons or select for preset: Formal, Casual, Técnico
  - [x] Textarea for custom tone description
  - [x] Textarea for writing guidelines
  - [x] Save button with loading state
  - [x] Auto-populate from server on mount

- [x] Task 7: Create EmailExamplesForm component (AC: #4, #5)
  - [x] Create `src/components/settings/EmailExamplesForm.tsx`
  - [x] List of existing examples with edit/delete buttons
  - [x] "Adicionar Exemplo" button to add new
  - [x] Dialog/modal for add/edit form with fields: subject, body, context
  - [x] Confirmation dialog for delete
  - [x] Empty state when no examples exist

- [x] Task 8: Update KnowledgeBaseTabs to render new forms (AC: #1, #4)
  - [x] Replace ComingSoonCard for "tone" with ToneOfVoiceForm
  - [x] Replace ComingSoonCard for "examples" with EmailExamplesForm
  - [x] Keep ICP as ComingSoonCard (Story 2.6)

- [x] Task 9: Write tests (AC: All)
  - [x] Unit tests for ToneOfVoiceForm component
  - [x] Unit tests for EmailExamplesForm component
  - [x] Unit tests for useToneOfVoice hook
  - [x] Unit tests for useEmailExamples hook
  - [x] Unit tests for new server actions
  - [x] Unit tests for new Zod schemas

- [x] Task 10: Run tests and verify build
  - [x] All tests pass (419 passing, 12 pre-existing failures in use-user.test.ts)
  - [x] Build succeeds for Story 2.5 code (pre-existing error in use-user.ts:169 not related to this story)
  - [x] Lint passes for all Story 2.5 files

## Dev Notes

### Epic 2 Context

Epic 2 is **Administration & Configuration**. This story extends the knowledge base from Story 2.4 with tone of voice and email examples that will be used by AI for content generation in Epic 6.

**FRs cobertos:**
- FR43: Admin pode configurar tom de voz preferido (formal, casual, técnico)
- FR44: Admin pode adicionar exemplos de emails bem-sucedidos

**NFRs relevantes:**
- NFR-S3: Dados isolados por tenant_id em todas as queries

### Architecture Pattern: Server Actions (from Story 2.4)

All server actions follow this established pattern:

```typescript
// src/actions/knowledge-base.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import type { ActionResult } from "@/types/knowledge-base";

export async function saveToneOfVoice(
  data: ToneOfVoiceInput
): Promise<ActionResult<void>> {
  // 1. Validate admin role
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, error: "Apenas administradores podem editar a base de conhecimento." };
  }

  // 2. Validate input with Zod
  const validated = toneOfVoiceSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: "Dados inválidos." };
  }

  // 3. Upsert to database
  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_base")
    .upsert({
      tenant_id: profile.tenant_id,
      section: "tone",
      content: validated.data,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,section" });

  if (error) {
    return { success: false, error: "Erro ao salvar. Tente novamente." };
  }

  return { success: true };
}
```

### Database Schema

**Tone of Voice (uses existing knowledge_base table):**

```sql
-- Uses existing knowledge_base table with section = 'tone'
-- Content JSONB structure:
{
  "preset": "formal" | "casual" | "technical",
  "custom_description": "string",
  "writing_guidelines": "string"
}
```

**Email Examples (NEW TABLE):**

```sql
-- supabase/migrations/00008_create_knowledge_base_examples.sql
CREATE TABLE public.knowledge_base_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX idx_kb_examples_tenant ON public.knowledge_base_examples(tenant_id);

-- RLS
ALTER TABLE public.knowledge_base_examples ENABLE ROW LEVEL SECURITY;

-- Policies (same pattern as knowledge_base)
CREATE POLICY "Admins can view own tenant examples"
  ON public.knowledge_base_examples
  FOR SELECT
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

CREATE POLICY "Admins can insert examples"
  ON public.knowledge_base_examples
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

CREATE POLICY "Admins can update own tenant examples"
  ON public.knowledge_base_examples
  FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

CREATE POLICY "Admins can delete own tenant examples"
  ON public.knowledge_base_examples
  FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );
```

### Content Schemas (TypeScript)

```typescript
// Add to src/types/knowledge-base.ts

// ==============================================
// TONE OF VOICE TYPES
// ==============================================

export const TONE_PRESETS = ["formal", "casual", "technical"] as const;
export type TonePreset = (typeof TONE_PRESETS)[number];

export const TONE_PRESET_LABELS: Record<TonePreset, string> = {
  formal: "Formal",
  casual: "Casual",
  technical: "Técnico",
};

export interface ToneOfVoice {
  preset: TonePreset;
  custom_description: string;
  writing_guidelines: string;
}

export const toneOfVoiceSchema = z.object({
  preset: z.enum(TONE_PRESETS),
  custom_description: z.string().max(2000, "Descrição muito longa"),
  writing_guidelines: z.string().max(5000, "Diretrizes muito longas"),
});

export type ToneOfVoiceInput = z.infer<typeof toneOfVoiceSchema>;

// ==============================================
// EMAIL EXAMPLES TYPES
// ==============================================

export interface EmailExample {
  id: string;
  tenant_id: string;
  subject: string;
  body: string;
  context: string | null;
  created_at: string;
  updated_at: string;
}

export const emailExampleSchema = z.object({
  subject: z
    .string()
    .min(1, "Assunto é obrigatório")
    .max(200, "Assunto muito longo"),
  body: z
    .string()
    .min(1, "Corpo do email é obrigatório")
    .max(10000, "Texto muito longo"),
  context: z.string().max(1000, "Contexto muito longo").optional(),
});

export type EmailExampleInput = z.infer<typeof emailExampleSchema>;

export type EmailExampleInsert = Omit<
  EmailExample,
  "id" | "created_at" | "updated_at"
>;
```

### UI Component Structures

**ToneOfVoiceForm.tsx:**

```tsx
"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToneOfVoice } from "@/hooks/use-tone-of-voice";
import {
  toneOfVoiceSchema,
  type ToneOfVoiceInput,
  TONE_PRESETS,
  TONE_PRESET_LABELS,
} from "@/types/knowledge-base";

export function ToneOfVoiceForm() {
  const { data, isLoading, saveTone, isSaving, error } = useToneOfVoice();

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<ToneOfVoiceInput>({
    resolver: zodResolver(toneOfVoiceSchema),
    defaultValues: {
      preset: "formal",
      custom_description: "",
      writing_guidelines: "",
    },
  });

  // Populate form with data when loaded
  useEffect(() => {
    if (data) {
      reset({
        preset: data.preset || "formal",
        custom_description: data.custom_description || "",
        writing_guidelines: data.writing_guidelines || "",
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: ToneOfVoiceInput) => {
    const result = await saveTone(values);
    if (result.success) {
      toast.success("Tom de voz salvo com sucesso");
    } else {
      toast.error(result.error || "Erro ao salvar. Tente novamente.");
    }
  };

  // ... loading/error states, form JSX
}
```

**EmailExamplesForm.tsx:**

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEmailExamples } from "@/hooks/use-email-examples";
import {
  emailExampleSchema,
  type EmailExampleInput,
  type EmailExample,
} from "@/types/knowledge-base";

export function EmailExamplesForm() {
  const { examples, isLoading, createExample, updateExample, deleteExample, isCreating, isUpdating, isDeleting } = useEmailExamples();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExample, setEditingExample] = useState<EmailExample | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exampleToDelete, setExampleToDelete] = useState<string | null>(null);

  // ... form handling, dialog management
}
```

### Update KnowledgeBaseTabs

```tsx
// src/components/settings/KnowledgeBaseTabs.tsx
import { ToneOfVoiceForm } from "./ToneOfVoiceForm";
import { EmailExamplesForm } from "./EmailExamplesForm";

// Replace in TabsContent for "tone":
<TabsContent value="tone" className="mt-4">
  <Card className="bg-background-secondary border-border">
    <CardHeader>
      <CardTitle className="text-h3">Tom de Voz</CardTitle>
      <CardDescription className="text-body-small text-foreground-muted">
        Configure o estilo e tom de comunicação da sua empresa para os emails gerados.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ToneOfVoiceForm />
    </CardContent>
  </Card>
</TabsContent>

// Replace in TabsContent for "examples":
<TabsContent value="examples" className="mt-4">
  <Card className="bg-background-secondary border-border">
    <CardHeader>
      <CardTitle className="text-h3">Exemplos de Email</CardTitle>
      <CardDescription className="text-body-small text-foreground-muted">
        Adicione exemplos de emails bem-sucedidos para a IA aprender o seu estilo.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <EmailExamplesForm />
    </CardContent>
  </Card>
</TabsContent>
```

### Previous Story Intelligence (2.4)

**Key patterns to reuse:**

```typescript
// ActionResult type from src/types/knowledge-base.ts (already exists)
export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

// Admin role check pattern (already exists in actions)
const profile = await getCurrentUserProfile();
if (!profile || profile.role !== "admin") {
  return { success: false, error: "Apenas administradores..." };
}

// Generic section functions already exist
getKnowledgeBaseSection<T>(section: KnowledgeBaseSection)
saveKnowledgeBaseSection<T>(section: KnowledgeBaseSection, content: T)

// Use for tone:
getKnowledgeBaseSection<ToneOfVoice>("tone")
saveKnowledgeBaseSection("tone", toneData)
```

**329 tests passing** from Story 2.4. Ensure new tests follow same patterns.

### Git Intelligence (Recent Commits)

From recent git history:
- `0ade6ce fix(auth): resolve race condition causing page freeze on reload`
- `dec1dde feat(story-2.4): knowledge base editor with company profile`
- `29f02a0 feat(epic-2): complete stories 2.2 and 2.3 - API keys and connection testing`

**Patterns established:**
- Commit message format: `type(scope): description`
- Code review fixes included
- TanStack Query infrastructure already in place

### Project Structure Notes

**New files to create:**

```
src/
├── components/settings/
│   ├── ToneOfVoiceForm.tsx       # Tone form component
│   └── EmailExamplesForm.tsx      # Examples CRUD component
├── hooks/
│   ├── use-tone-of-voice.ts       # TanStack Query hook for tone
│   └── use-email-examples.ts      # TanStack Query hook for examples

supabase/migrations/
└── 00008_create_knowledge_base_examples.sql

__tests__/unit/
├── components/settings/
│   ├── ToneOfVoiceForm.test.tsx
│   └── EmailExamplesForm.test.tsx
├── hooks/
│   ├── use-tone-of-voice.test.tsx
│   └── use-email-examples.test.tsx
└── actions/
    └── knowledge-base-extended.test.ts  # Test new actions
```

**Files to modify:**

- `src/types/knowledge-base.ts` - Add ToneOfVoice and EmailExample types
- `src/actions/knowledge-base.ts` - Add tone and example actions
- `src/components/settings/KnowledgeBaseTabs.tsx` - Replace ComingSoonCard with forms

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Naming | snake_case for DB columns, camelCase for TypeScript |
| Security | Admin-only access, tenant isolation via RLS |
| Error Handling | Portuguese error messages |
| State | TanStack Query for server state |
| Forms | react-hook-form + zod |
| Feedback | Toast notifications via Sonner |
| Validation | Zod schemas for all inputs |
| Components | shadcn/ui (RadioGroup, Dialog, AlertDialog) |

### Testing Strategy

```typescript
// __tests__/unit/components/settings/ToneOfVoiceForm.test.tsx
describe('ToneOfVoiceForm', () => {
  it('renders all form fields');
  it('shows loading skeleton when data is loading');
  it('populates fields with existing data');
  it('allows selecting tone preset');
  it('validates required fields');
  it('shows loading state during save');
  it('shows success toast on save');
  it('shows error toast on failure');
});

// __tests__/unit/components/settings/EmailExamplesForm.test.tsx
describe('EmailExamplesForm', () => {
  it('renders empty state when no examples');
  it('renders list of examples');
  it('opens add dialog when clicking add button');
  it('opens edit dialog when clicking edit button');
  it('opens delete confirmation when clicking delete');
  it('creates new example successfully');
  it('updates existing example successfully');
  it('deletes example after confirmation');
  it('shows loading state during operations');
  it('shows success toast on operations');
});

// __tests__/unit/hooks/use-tone-of-voice.test.tsx
describe('useToneOfVoice', () => {
  it('fetches tone data');
  it('handles loading state');
  it('handles error state');
  it('saves tone settings');
  it('updates cache after save');
});

// __tests__/unit/hooks/use-email-examples.test.tsx
describe('useEmailExamples', () => {
  it('fetches examples list');
  it('handles empty list');
  it('creates new example');
  it('updates existing example');
  it('deletes example');
  it('invalidates cache after mutations');
});

// __tests__/unit/actions/knowledge-base-extended.test.ts
describe('tone and examples actions', () => {
  // Tone actions
  it('getToneOfVoice requires authentication');
  it('getToneOfVoice requires admin role');
  it('saveToneOfVoice validates input');
  it('saveToneOfVoice saves to database');

  // Example actions
  it('getEmailExamples returns all tenant examples');
  it('createEmailExample validates input');
  it('createEmailExample inserts to database');
  it('updateEmailExample validates input');
  it('updateEmailExample updates in database');
  it('deleteEmailExample removes from database');
});

// __tests__/unit/types/knowledge-base-extended.test.ts
describe('tone and example schemas', () => {
  it('toneOfVoiceSchema validates preset enum');
  it('toneOfVoiceSchema enforces max lengths');
  it('emailExampleSchema requires subject and body');
  it('emailExampleSchema enforces max lengths');
});
```

### What NOT to Do

- Do NOT implement ICP section - that's Story 2.6
- Do NOT add AI generation logic - that's Epic 6
- Do NOT skip admin role validation
- Do NOT store data without tenant isolation
- Do NOT use useState for server data - use TanStack Query
- Do NOT create examples directly in knowledge_base.content - use separate table

### Dependencies

**Already installed (from Story 2.4):**
- `react-hook-form` - Form handling
- `zod` - Validation
- `@hookform/resolvers` - Zod resolver
- `@tanstack/react-query` - Server state
- `sonner` - Toast notifications
- `lucide-react` - Icons
- `@radix-ui/react-radio-group` - RadioGroup (via shadcn)
- `@radix-ui/react-dialog` - Dialog (via shadcn)
- `@radix-ui/react-alert-dialog` - AlertDialog (via shadcn)

**May need to add shadcn components:**
```bash
npx shadcn add radio-group
npx shadcn add dialog
npx shadcn add alert-dialog
```

### UX Notes (from ux-design-specification.md)

- Dark mode as default (background #070C1B)
- Generous spacing (base 4px, multiples of 8)
- Form pattern: Label above input with `mb-2 block`
- RadioGroup: Vertical layout with clear labels
- Dialog: 12px border-radius, max-width 500px
- AlertDialog: Destructive action button in red
- Textarea: rows={4} for description fields, rows={8} for body
- Button: Primary style for "Salvar", destructive for "Excluir"
- Toast: bottom-right, success=green, error=red, auto-dismiss 3-5s
- Empty state: Icon + message + action button

### References

- [Source: architecture.md#Data-Architecture] - JSONB for flexible content, separate table for examples
- [Source: architecture.md#Implementation-Patterns] - Server action pattern
- [Source: epics.md#Story-2.5] - Acceptance criteria
- [Source: ux-design-specification.md#Form-Patterns] - Form styling
- [Source: Story 2.4] - Server actions, admin validation, toast patterns, hook patterns
- [Source: knowledge-base.ts] - Existing types and generic functions to extend

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Pre-existing build error in `src/hooks/use-user.ts:169` - TypeScript error with implicit `any` type. This file was modified before Story 2.5 (visible in initial git status).
- Pre-existing test failures in `__tests__/unit/hooks/use-user.test.ts` - 12 tests failing due to mock issues with supabase.auth.getSession.

### Completion Notes List

- **AC #1**: Tom de Voz section implemented with radio buttons for presets (Formal, Casual, Técnico), custom description textarea, and writing guidelines textarea.
- **AC #2**: Save functionality implemented with success toast "Tom de voz salvo com sucesso" and proper loading states.
- **AC #3**: Data persistence working via TanStack Query - saved settings populate on page reload.
- **AC #4**: Exemplos section implemented with subject, body, and context fields for each email example.
- **AC #5**: Full CRUD for email examples - add, edit, delete with confirmation dialogs and toast notifications.
- **AC #6**: Database migration created with proper RLS policies for tenant isolation.
- Added shadcn components: radio-group, dialog, alert-dialog.
- All new code follows existing patterns from Story 2.4.
- 424 tests passing (28 test files passing).

### Code Review (2026-01-30)

**Reviewer:** Claude Opus 4.5 (Adversarial Code Review)

**Issues Fixed:**
1. Added UUID validation to `updateEmailExample` and `deleteEmailExample` actions (security enhancement)
2. Added `uuidSchema` to types with Portuguese error message
3. Updated tests to use valid UUID format and added tests for UUID validation
4. Fixed File List to include package.json and package-lock.json modifications
5. Updated Task 10 status to accurately reflect pre-existing build error

**Test Results Post-Review:**
- 424 tests passing (+5 new tests for UUID validation)
- 12 pre-existing failures in use-user.test.ts (not related to Story 2.5)

### File List

**New Files:**
- supabase/migrations/00008_create_knowledge_base_examples.sql
- src/hooks/use-tone-of-voice.ts
- src/hooks/use-email-examples.ts
- src/components/settings/ToneOfVoiceForm.tsx
- src/components/settings/EmailExamplesForm.tsx
- src/components/ui/radio-group.tsx (via shadcn)
- src/components/ui/dialog.tsx (via shadcn)
- src/components/ui/alert-dialog.tsx (via shadcn)
- __tests__/unit/components/settings/ToneOfVoiceForm.test.tsx
- __tests__/unit/components/settings/EmailExamplesForm.test.tsx
- __tests__/unit/hooks/use-tone-of-voice.test.tsx
- __tests__/unit/hooks/use-email-examples.test.tsx

**Modified Files:**
- src/types/knowledge-base.ts (added ToneOfVoice and EmailExample types)
- src/actions/knowledge-base.ts (added tone and email example actions)
- src/components/settings/KnowledgeBaseTabs.tsx (replaced ComingSoonCard with forms)
- __tests__/unit/types/knowledge-base.test.ts (added schema tests)
- __tests__/unit/actions/knowledge-base.test.ts (added action tests)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status update)
- package.json (added @radix-ui dependencies for shadcn components)
- package-lock.json (dependency lockfile updated)

