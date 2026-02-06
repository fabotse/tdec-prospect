# Story 2.6: Knowledge Base Editor - ICP Definition

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to define my Ideal Customer Profile,
So that AI can personalize outreach appropriately.

## Acceptance Criteria

1. **Given** I am on Base de Conhecimento tab
   **When** I access ICP section
   **Then** I can define target company size (employee range)
   **And** I see options like: 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+
   **And** I can select multiple size ranges

2. **Given** I am on ICP section
   **When** I access the Industries/Sectors field
   **Then** I can define target industries/sectors
   **And** I can add multiple industries as tags/chips
   **And** I can remove individual industries

3. **Given** I am on ICP section
   **When** I access the Job Titles field
   **Then** I can define target job titles
   **And** I can add multiple titles as tags/chips
   **And** I can remove individual titles

4. **Given** I am on ICP section
   **When** I access the Geographic Focus field
   **Then** I can define geographic focus areas
   **And** I can add multiple locations/regions
   **And** I can remove individual locations

5. **Given** I am on ICP section
   **When** I access the Pain Points field
   **Then** I can define pain points we solve (textarea)
   **And** I can describe each pain point in detail

6. **Given** I am on ICP section
   **When** I access the Common Objections field
   **Then** I can define common objections (textarea)
   **And** I can list objections and suggested responses

7. **Given** I save ICP settings
   **When** I click "Salvar"
   **Then** the data is saved to the knowledge_base table (section="icp")
   **And** I see a success toast: "ICP salvo com sucesso"
   **And** the save button returns to normal state

8. **Given** I reload the page after saving ICP settings
   **When** the page loads
   **Then** the previously saved ICP settings are populated

## Tasks / Subtasks

- [x] Task 1: Create TypeScript types for ICP (AC: #1-#6)
  - [x] Add types to `src/types/knowledge-base.ts`
  - [x] `COMPANY_SIZES` constant array with size ranges
  - [x] `ICPDefinition` interface with all fields
  - [x] `icpDefinitionSchema` Zod schema for validation
  - [x] Unit tests for schema validation

- [x] Task 2: Create server actions for ICP (AC: #7, #8)
  - [x] Add `getICPDefinition()` to `src/actions/knowledge-base.ts`
  - [x] Add `saveICPDefinition(data)` to `src/actions/knowledge-base.ts`
  - [x] Admin role validation in actions
  - [x] Return `ActionResult<T>` pattern
  - [x] Unit tests for actions

- [x] Task 3: Create useICPDefinition hook (AC: #7, #8)
  - [x] Create `src/hooks/use-icp-definition.ts`
  - [x] TanStack Query for fetching ICP data
  - [x] Mutation for saving with cache update
  - [x] Handle loading/error/success states
  - [x] Unit tests for hook

- [x] Task 4: Create ICPDefinitionForm component (AC: #1-#8)
  - [x] Create `src/components/settings/ICPDefinitionForm.tsx`
  - [x] Checkbox group for company sizes (multi-select)
  - [x] Tag input for industries (add/remove chips)
  - [x] Tag input for job titles (add/remove chips)
  - [x] Tag input for geographic focus (add/remove chips)
  - [x] Textarea for pain points
  - [x] Textarea for common objections
  - [x] Save button with loading state
  - [x] Auto-populate from server on mount
  - [x] Unit tests for component

- [x] Task 5: Update KnowledgeBaseTabs to render ICPDefinitionForm (AC: All)
  - [x] Replace ComingSoonCard for "icp" with ICPDefinitionForm
  - [x] Verify all tabs work correctly

- [x] Task 6: Run tests and verify build
  - [x] All new tests pass
  - [x] Build succeeds
  - [x] Lint passes for all Story 2.6 files

## Dev Notes

### Epic 2 Context

Epic 2 is **Administration & Configuration**. This story completes the knowledge base editor by adding ICP (Ideal Customer Profile) definition. The ICP data will be used by AI in Epic 6 for content personalization.

**FRs cobertos:**
- FR45: Admin pode definir informações sobre ICP (Ideal Customer Profile)

**NFRs relevantes:**
- NFR-S3: Dados isolados por tenant_id em todas as queries

### Architecture Pattern: Server Actions (from Stories 2.4 and 2.5)

All server actions follow this established pattern:

```typescript
// src/actions/knowledge-base.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import type { ActionResult, ICPDefinition, ICPDefinitionInput } from "@/types/knowledge-base";
import { icpDefinitionSchema } from "@/types/knowledge-base";

export async function getICPDefinition(): Promise<ActionResult<ICPDefinition | null>> {
  // 1. Validate admin role
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, error: "Apenas administradores podem acessar a base de conhecimento." };
  }

  // 2. Fetch from database using generic function
  return getKnowledgeBaseSection<ICPDefinition>("icp");
}

export async function saveICPDefinition(
  data: ICPDefinitionInput
): Promise<ActionResult<void>> {
  // 1. Validate admin role
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, error: "Apenas administradores podem editar a base de conhecimento." };
  }

  // 2. Validate input with Zod
  const validated = icpDefinitionSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: "Dados inválidos." };
  }

  // 3. Upsert to database using generic function
  return saveKnowledgeBaseSection("icp", validated.data);
}
```

### Database Schema

ICP uses the existing `knowledge_base` table with `section = 'icp'`:

```sql
-- Uses existing knowledge_base table
-- tenant_id, section='icp', content (JSONB)

-- Content JSONB structure:
{
  "company_sizes": ["11-50", "51-200", "201-500"],
  "industries": ["Tecnologia", "SaaS", "Fintech"],
  "job_titles": ["CEO", "CTO", "VP de Vendas", "Diretor Comercial"],
  "geographic_focus": ["São Paulo", "Brasil", "América Latina"],
  "pain_points": "- Dificuldade em escalar prospecção\n- Textos genéricos que não convertem\n- Alto tempo gasto em pesquisa manual",
  "common_objections": "- 'Já usamos outra ferramenta'\n  Resposta: Nossa solução complementa...\n- 'Parece caro'\n  Resposta: Considere o ROI..."
}
```

### Content Schemas (TypeScript)

```typescript
// Add to src/types/knowledge-base.ts

// ==============================================
// ICP DEFINITION TYPES
// ==============================================

export const COMPANY_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  "1-10": "1-10 funcionários",
  "11-50": "11-50 funcionários",
  "51-200": "51-200 funcionários",
  "201-500": "201-500 funcionários",
  "501-1000": "501-1000 funcionários",
  "1000+": "1000+ funcionários",
};

export interface ICPDefinition {
  company_sizes: CompanySize[];
  industries: string[];
  job_titles: string[];
  geographic_focus: string[];
  pain_points: string;
  common_objections: string;
}

export const icpDefinitionSchema = z.object({
  company_sizes: z.array(z.enum(COMPANY_SIZES)).min(1, "Selecione ao menos um tamanho de empresa"),
  industries: z.array(z.string().min(1).max(100)).default([]),
  job_titles: z.array(z.string().min(1).max(100)).default([]),
  geographic_focus: z.array(z.string().min(1).max(100)).default([]),
  pain_points: z.string().max(5000, "Texto muito longo").default(""),
  common_objections: z.string().max(5000, "Texto muito longo").default(""),
});

export type ICPDefinitionInput = z.infer<typeof icpDefinitionSchema>;
```

### UI Component Structure

**ICPDefinitionForm.tsx:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useICPDefinition } from "@/hooks/use-icp-definition";
import {
  icpDefinitionSchema,
  type ICPDefinitionInput,
  COMPANY_SIZES,
  COMPANY_SIZE_LABELS,
} from "@/types/knowledge-base";

export function ICPDefinitionForm() {
  const { data, isLoading, saveICP, isSaving, error } = useICPDefinition();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ICPDefinitionInput>({
    resolver: zodResolver(icpDefinitionSchema),
    defaultValues: {
      company_sizes: [],
      industries: [],
      job_titles: [],
      geographic_focus: [],
      pain_points: "",
      common_objections: "",
    },
  });

  // State for tag inputs
  const [industryInput, setIndustryInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [locationInput, setLocationInput] = useState("");

  // Watch arrays for real-time display
  const companySizes = watch("company_sizes");
  const industries = watch("industries");
  const jobTitles = watch("job_titles");
  const geographicFocus = watch("geographic_focus");

  // Populate form with data when loaded
  useEffect(() => {
    if (data) {
      reset({
        company_sizes: data.company_sizes || [],
        industries: data.industries || [],
        job_titles: data.job_titles || [],
        geographic_focus: data.geographic_focus || [],
        pain_points: data.pain_points || "",
        common_objections: data.common_objections || "",
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: ICPDefinitionInput) => {
    const result = await saveICP(values);
    if (result.success) {
      toast.success("ICP salvo com sucesso");
    } else {
      toast.error(result.error || "Erro ao salvar. Tente novamente.");
    }
  };

  // Tag management functions
  const addTag = (field: "industries" | "job_titles" | "geographic_focus", value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const currentValues = watch(field);
    if (!currentValues.includes(trimmed)) {
      setValue(field, [...currentValues, trimmed]);
    }
  };

  const removeTag = (field: "industries" | "job_titles" | "geographic_focus", value: string) => {
    const currentValues = watch(field);
    setValue(field, currentValues.filter((v) => v !== value));
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    field: "industries" | "job_titles" | "geographic_focus",
    value: string,
    setValue: (val: string) => void
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(field, value);
      setValue("");
    }
  };

  if (isLoading) {
    return <ICPFormSkeleton />;
  }

  if (error) {
    return (
      <div className="text-destructive">
        Erro ao carregar dados: {error.message}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Company Sizes - Checkbox Group */}
      <div className="space-y-3">
        <Label className="text-body font-medium">Tamanho da Empresa</Label>
        <p className="text-body-small text-foreground-muted">
          Selecione os tamanhos de empresa que você atende
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {COMPANY_SIZES.map((size) => (
            <label
              key={size}
              className="flex items-center space-x-2 cursor-pointer"
            >
              <Checkbox
                checked={companySizes?.includes(size)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setValue("company_sizes", [...(companySizes || []), size]);
                  } else {
                    setValue(
                      "company_sizes",
                      (companySizes || []).filter((s) => s !== size)
                    );
                  }
                }}
              />
              <span className="text-body-small">{COMPANY_SIZE_LABELS[size]}</span>
            </label>
          ))}
        </div>
        {errors.company_sizes && (
          <p className="text-xs text-destructive">{errors.company_sizes.message}</p>
        )}
      </div>

      {/* Industries - Tag Input */}
      <TagInputField
        label="Setores/Indústrias"
        description="Adicione os setores que você atende (pressione Enter para adicionar)"
        tags={industries || []}
        inputValue={industryInput}
        onInputChange={setIndustryInput}
        onAddTag={() => { addTag("industries", industryInput); setIndustryInput(""); }}
        onRemoveTag={(tag) => removeTag("industries", tag)}
        onKeyDown={(e) => handleKeyDown(e, "industries", industryInput, setIndustryInput)}
        placeholder="Ex: Tecnologia, SaaS, Fintech"
      />

      {/* Job Titles - Tag Input */}
      <TagInputField
        label="Cargos Alvo"
        description="Adicione os cargos que você busca alcançar"
        tags={jobTitles || []}
        inputValue={titleInput}
        onInputChange={setTitleInput}
        onAddTag={() => { addTag("job_titles", titleInput); setTitleInput(""); }}
        onRemoveTag={(tag) => removeTag("job_titles", tag)}
        onKeyDown={(e) => handleKeyDown(e, "job_titles", titleInput, setTitleInput)}
        placeholder="Ex: CEO, CTO, VP de Vendas"
      />

      {/* Geographic Focus - Tag Input */}
      <TagInputField
        label="Foco Geográfico"
        description="Adicione as regiões/localidades que você atende"
        tags={geographicFocus || []}
        inputValue={locationInput}
        onInputChange={setLocationInput}
        onAddTag={() => { addTag("geographic_focus", locationInput); setLocationInput(""); }}
        onRemoveTag={(tag) => removeTag("geographic_focus", tag)}
        onKeyDown={(e) => handleKeyDown(e, "geographic_focus", locationInput, setLocationInput)}
        placeholder="Ex: São Paulo, Brasil, América Latina"
      />

      {/* Pain Points - Textarea */}
      <div className="space-y-2">
        <Label htmlFor="pain_points" className="mb-2 block">
          Dores que Resolvemos
        </Label>
        <p className="text-body-small text-foreground-muted mb-2">
          Descreva as principais dores/problemas que sua solução resolve
        </p>
        <Textarea
          id="pain_points"
          {...register("pain_points")}
          rows={4}
          placeholder="- Dificuldade em escalar prospecção&#10;- Textos genéricos que não convertem&#10;- Alto tempo gasto em pesquisa manual"
          className="resize-none"
        />
        {errors.pain_points && (
          <p className="text-xs text-destructive">{errors.pain_points.message}</p>
        )}
      </div>

      {/* Common Objections - Textarea */}
      <div className="space-y-2">
        <Label htmlFor="common_objections" className="mb-2 block">
          Objeções Comuns
        </Label>
        <p className="text-body-small text-foreground-muted mb-2">
          Liste objeções comuns e como respondê-las
        </p>
        <Textarea
          id="common_objections"
          {...register("common_objections")}
          rows={6}
          placeholder="- 'Já usamos outra ferramenta'&#10;  Resposta: Nossa solução complementa...&#10;&#10;- 'Parece caro'&#10;  Resposta: Considere o ROI..."
          className="resize-none"
        />
        {errors.common_objections && (
          <p className="text-xs text-destructive">{errors.common_objections.message}</p>
        )}
      </div>

      {/* Save Button */}
      <Button type="submit" disabled={isSaving}>
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Salvando...
          </>
        ) : (
          "Salvar"
        )}
      </Button>
    </form>
  );
}

// Tag Input Field Component
function TagInputField({
  label,
  description,
  tags,
  inputValue,
  onInputChange,
  onAddTag,
  onRemoveTag,
  onKeyDown,
  placeholder,
}: {
  label: string;
  description: string;
  tags: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="mb-2 block">{label}</Label>
      <p className="text-body-small text-foreground-muted mb-2">{description}</p>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onAddTag}
          disabled={!inputValue.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// Skeleton for loading state
function ICPFormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-10 w-24" />
    </div>
  );
}
```

### Hook Structure

```typescript
// src/hooks/use-icp-definition.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getICPDefinition, saveICPDefinition } from "@/actions/knowledge-base";
import type { ICPDefinition, ICPDefinitionInput, ActionResult } from "@/types/knowledge-base";

const ICP_QUERY_KEY = ["knowledge-base", "icp"];

export function useICPDefinition() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ICP_QUERY_KEY,
    queryFn: async () => {
      const result = await getICPDefinition();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data ?? null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const mutation = useMutation({
    mutationFn: async (data: ICPDefinitionInput): Promise<ActionResult<void>> => {
      return saveICPDefinition(data);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ICP_QUERY_KEY });
      }
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    saveICP: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
```

### Update KnowledgeBaseTabs

```tsx
// src/components/settings/KnowledgeBaseTabs.tsx
import { ICPDefinitionForm } from "./ICPDefinitionForm";

// Replace in TabsContent for "icp":
<TabsContent value="icp" className="mt-4">
  <Card className="bg-background-secondary border-border">
    <CardHeader>
      <CardTitle className="text-h3">ICP (Ideal Customer Profile)</CardTitle>
      <CardDescription className="text-body-small text-foreground-muted">
        Defina o perfil do seu cliente ideal para personalização de conteúdo.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ICPDefinitionForm />
    </CardContent>
  </Card>
</TabsContent>
```

### Previous Story Intelligence (2.5)

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

// Use for ICP:
getKnowledgeBaseSection<ICPDefinition>("icp")
saveKnowledgeBaseSection("icp", icpData)
```

**Story 2.5 test count:** 424 tests passing. Ensure new tests follow same patterns.

### Git Intelligence (Recent Commits)

From recent git history:
- `0ade6ce fix(auth): resolve race condition causing page freeze on reload`
- `dec1dde feat(story-2.4): knowledge base editor with company profile`
- `29f02a0 feat(epic-2): complete stories 2.2 and 2.3 - API keys and connection testing`

**Patterns established:**
- Commit message format: `type(scope): description`
- TanStack Query infrastructure in place
- Form patterns with react-hook-form + zod established

### Project Structure Notes

**New files to create:**

```
src/
├── components/settings/
│   └── ICPDefinitionForm.tsx       # ICP form component
├── hooks/
│   └── use-icp-definition.ts       # TanStack Query hook for ICP

__tests__/unit/
├── components/settings/
│   └── ICPDefinitionForm.test.tsx
├── hooks/
│   └── use-icp-definition.test.tsx
└── types/
    └── knowledge-base-icp.test.ts  # Test ICP schemas
```

**Files to modify:**

- `src/types/knowledge-base.ts` - Add ICPDefinition types and schema
- `src/actions/knowledge-base.ts` - Add getICPDefinition and saveICPDefinition
- `src/components/settings/KnowledgeBaseTabs.tsx` - Replace ComingSoonCard with ICPDefinitionForm
- `__tests__/unit/actions/knowledge-base.test.ts` - Add ICP action tests

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
| Components | shadcn/ui (Checkbox, Badge, Input, Textarea) |

### Testing Strategy

```typescript
// __tests__/unit/components/settings/ICPDefinitionForm.test.tsx
describe('ICPDefinitionForm', () => {
  it('renders all form sections');
  it('shows loading skeleton when data is loading');
  it('populates fields with existing data');
  it('allows selecting multiple company sizes');
  it('allows adding industries as tags');
  it('allows removing industries');
  it('allows adding job titles as tags');
  it('allows removing job titles');
  it('allows adding geographic focus as tags');
  it('allows removing geographic focus');
  it('validates at least one company size is selected');
  it('shows loading state during save');
  it('shows success toast on save');
  it('shows error toast on failure');
});

// __tests__/unit/hooks/use-icp-definition.test.tsx
describe('useICPDefinition', () => {
  it('fetches ICP data');
  it('handles loading state');
  it('handles error state');
  it('saves ICP settings');
  it('updates cache after save');
});

// __tests__/unit/actions/knowledge-base-icp.test.ts
describe('ICP actions', () => {
  it('getICPDefinition requires authentication');
  it('getICPDefinition requires admin role');
  it('saveICPDefinition validates input');
  it('saveICPDefinition validates at least one company size');
  it('saveICPDefinition saves to database');
});

// __tests__/unit/types/knowledge-base-icp.test.ts
describe('ICP schema', () => {
  it('icpDefinitionSchema validates company_sizes array');
  it('icpDefinitionSchema requires at least one company size');
  it('icpDefinitionSchema accepts valid industries array');
  it('icpDefinitionSchema accepts valid job_titles array');
  it('icpDefinitionSchema accepts valid geographic_focus array');
  it('icpDefinitionSchema enforces max length for pain_points');
  it('icpDefinitionSchema enforces max length for common_objections');
});
```

### What NOT to Do

- Do NOT implement AI generation logic - that's Epic 6
- Do NOT skip admin role validation
- Do NOT store data without tenant isolation
- Do NOT use useState for server data - use TanStack Query
- Do NOT create complex sub-forms - keep it simple with checkboxes and tag inputs
- Do NOT add industry/title autocomplete - simple text input is sufficient for MVP

### Dependencies

**Already installed (from Stories 2.4, 2.5):**
- `react-hook-form` - Form handling
- `zod` - Validation
- `@hookform/resolvers` - Zod resolver
- `@tanstack/react-query` - Server state
- `sonner` - Toast notifications
- `lucide-react` - Icons (Plus, X, Loader2)

**shadcn components already available:**
- Checkbox - for company sizes
- Badge - for tags display
- Input - for tag input fields
- Textarea - for pain points and objections
- Button - for actions
- Skeleton - for loading state
- Label - for form labels

### UX Notes (from ux-design-specification.md)

- Dark mode as default (background #070C1B)
- Generous spacing (base 4px, multiples of 8)
- Form pattern: Label above input with `mb-2 block`
- Checkbox: Vertical layout in grid (2-3 columns)
- Badge: Secondary variant for tags with X button to remove
- Textarea: rows={4} for pain points, rows={6} for objections
- Button: Primary style for "Salvar"
- Toast: bottom-right, success=green, error=red, auto-dismiss 3-5s
- Tag input: Enter to add, X to remove

### References

- [Source: architecture.md#Data-Architecture] - JSONB for flexible content in knowledge_base
- [Source: architecture.md#Implementation-Patterns] - Server action pattern
- [Source: epics.md#Story-2.6] - Acceptance criteria
- [Source: ux-design-specification.md#Form-Patterns] - Form styling
- [Source: Story 2.4] - Server actions, admin validation, toast patterns
- [Source: Story 2.5] - Hook patterns, TanStack Query patterns
- [Source: knowledge-base.ts] - Existing types and generic functions to extend

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Fixed type error in Zod schema by removing `.default()` modifiers
- Added @radix-ui/react-checkbox dependency and created Checkbox UI component
- Fixed unrelated type error in use-user.ts (Session type annotation)

### Completion Notes List

- ✅ Task 1: Added COMPANY_SIZES constant, COMPANY_SIZE_LABELS, ICPDefinition interface, and icpDefinitionSchema to knowledge-base.ts. 16 new type tests passing.
- ✅ Task 2: Added getICPDefinition() and saveICPDefinition() server actions following existing patterns. 10 new action tests passing.
- ✅ Task 3: Created useICPDefinition hook with TanStack Query for fetching and mutation. 14 hook tests passing.
- ✅ Task 4: Created ICPDefinitionForm with checkbox group for company sizes, tag inputs for industries/titles/locations, and textareas for pain points/objections. 23 component tests passing.
- ✅ Task 5: Updated KnowledgeBaseTabs to replace ComingSoonCard with ICPDefinitionForm for ICP tab.
- ✅ Task 6: All 499 tests pass, build succeeds, lint passes.

### File List

**New Files:**
- src/components/settings/ICPDefinitionForm.tsx
- src/components/ui/checkbox.tsx
- src/hooks/use-icp-definition.ts
- __tests__/unit/components/settings/ICPDefinitionForm.test.tsx
- __tests__/unit/hooks/use-icp-definition.test.tsx

**Modified Files:**
- src/types/knowledge-base.ts (added ICP types and schema)
- src/actions/knowledge-base.ts (added ICP actions)
- src/components/settings/KnowledgeBaseTabs.tsx (replaced ComingSoonCard with ICPDefinitionForm)
- __tests__/unit/types/knowledge-base.test.ts (added ICP schema tests)
- __tests__/unit/actions/knowledge-base.test.ts (added ICP action tests)
- src/hooks/use-user.ts (fixed unrelated Session type)
- __tests__/unit/hooks/use-user.test.ts (updated for Session type change)
- package.json (added @radix-ui/react-checkbox dependency)

## Change Log

- 2026-01-30: Story 2.6 implemented - ICP Definition editor with full CRUD functionality
- 2026-01-30: Code Review fixes applied:
  - M1: Added aria-label to tag remove buttons for accessibility
  - M2: Refactored addTag/removeTag to avoid calling watch() inside render functions
  - M3: Fixed textarea placeholders to use template literals for proper newlines
  - M4: Added aria-live="polite" to tag containers for screen reader announcements
  - L1: Added disabled styles to tag remove buttons
  - L3: Updated File List to include missing test file

