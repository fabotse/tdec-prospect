/**
 * CreateLeadsDialog Tests
 * Story 15.5: Criacao de Leads e Integracao com Pipeline
 *
 * AC: #1 - Dialog opens with selected contacts count
 * AC: #4 - Success toast and created/skipped counts
 * AC: #5 - Optional segment selection
 * AC: #6 - Duplicate display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CreateLeadsDialog } from "@/components/technographic/CreateLeadsDialog";
import type { Lead } from "@/types/lead";

// ==============================================
// MOCKS
// ==============================================

const mockCreateLeads = vi.fn();
const mockReset = vi.fn();

vi.mock("@/hooks/use-create-tech-leads", () => ({
  useCreateTechLeads: () => ({
    createLeads: mockCreateLeads,
    isLoading: false,
    error: null,
    data: null,
    reset: mockReset,
  }),
}));

vi.mock("@/hooks/use-segments", () => ({
  useSegments: () => ({
    data: [
      { id: "seg-1", name: "Segmento A", tenantId: "t1", description: null, createdAt: "", updatedAt: "", leadCount: 5 },
      { id: "seg-2", name: "Segmento B", tenantId: "t1", description: null, createdAt: "", updatedAt: "", leadCount: 10 },
    ],
    isLoading: false,
  }),
  useAddLeadsToSegment: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ added: 2 }),
    isPending: false,
  }),
  useCreateSegment: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: "seg-new", name: "Novo Segmento", leadCount: 0 }),
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ==============================================
// TEST DATA
// ==============================================

const mockContacts: Lead[] = [
  {
    id: "lead-1",
    tenantId: "tenant-1",
    apolloId: "apollo-1",
    firstName: "João",
    lastName: "Silva",
    email: "joao@acme.com",
    phone: null,
    companyName: "Acme Corp",
    companySize: null,
    industry: null,
    location: null,
    title: "CTO",
    linkedinUrl: null,
    photoUrl: null,
    status: "novo",
    hasEmail: true,
    hasDirectPhone: "Yes",
    createdAt: "2026-03-25T00:00:00Z",
    updatedAt: "2026-03-25T00:00:00Z",
    icebreaker: null,
    icebreakerGeneratedAt: null,
    linkedinPostsCache: null,
    isMonitored: false,
  },
  {
    id: "lead-2",
    tenantId: "tenant-1",
    apolloId: "apollo-2",
    firstName: "Maria",
    lastName: "Fernandes",
    email: "maria@beta.com",
    phone: null,
    companyName: "Beta Inc",
    companySize: null,
    industry: null,
    location: null,
    title: "VP Engineering",
    linkedinUrl: null,
    photoUrl: null,
    status: "novo",
    hasEmail: true,
    hasDirectPhone: null,
    createdAt: "2026-03-25T00:00:00Z",
    updatedAt: "2026-03-25T00:00:00Z",
    icebreaker: null,
    icebreakerGeneratedAt: null,
    linkedinPostsCache: null,
    isMonitored: false,
  },
];

// ==============================================
// HELPERS
// ==============================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function renderDialog(props?: Partial<React.ComponentProps<typeof CreateLeadsDialog>>) {
  return render(
    <CreateLeadsDialog
      open={true}
      onOpenChange={vi.fn()}
      selectedContacts={mockContacts}
      sourceTechnologies={["React", "Node.js"]}
      {...props}
    />,
    { wrapper: createWrapper() }
  );
}

// ==============================================
// TESTS
// ==============================================

describe("CreateLeadsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders with selected contacts count", () => {
    renderDialog();

    expect(screen.getByTestId("create-leads-dialog")).toBeInTheDocument();
    expect(screen.getByText(/2 contatos selecionados/)).toBeInTheDocument();
  });

  it("shows Criar Leads button", () => {
    renderDialog();

    expect(screen.getByTestId("create-leads-button")).toBeInTheDocument();
    expect(screen.getByTestId("create-leads-button")).toHaveTextContent("Criar Leads");
  });

  it("calls createLeads with correct params on button click", () => {
    renderDialog();

    fireEvent.click(screen.getByTestId("create-leads-button"));

    expect(mockCreateLeads).toHaveBeenCalledWith(
      expect.objectContaining({
        leads: expect.arrayContaining([
          expect.objectContaining({ apolloId: "apollo-1", firstName: "João" }),
          expect.objectContaining({ apolloId: "apollo-2", firstName: "Maria" }),
        ]),
        source: "theirStack + Apollo",
        sourceTechnology: "React, Node.js",
      }),
      expect.anything()
    );
  });

  it("does not render when open is false", () => {
    renderDialog({ open: false });

    expect(screen.queryByTestId("create-leads-dialog")).not.toBeInTheDocument();
  });

  // --- RESULT STEP (AC #4) ---

  it("shows result step with created and skipped counts after creation", async () => {
    mockCreateLeads.mockImplementation(
      (_params: unknown, options: { onSuccess: (data: { created: number; skipped: number; duplicateEmails: string[] }) => void }) => {
        options.onSuccess({ created: 1, skipped: 1, duplicateEmails: ["joao@acme.com"] });
      }
    );

    renderDialog();
    fireEvent.click(screen.getByTestId("create-leads-button"));

    await waitFor(() => {
      expect(screen.getByTestId("created-count")).toBeInTheDocument();
    });

    expect(screen.getByTestId("created-count")).toHaveTextContent("1 lead criado");
  });

  // --- DUPLICATE DISPLAY (AC #6) ---

  it("displays duplicate info when contacts were skipped", async () => {
    mockCreateLeads.mockImplementation(
      (_params: unknown, options: { onSuccess: (data: { created: number; skipped: number; duplicateEmails: string[] }) => void }) => {
        options.onSuccess({ created: 0, skipped: 2, duplicateEmails: ["a@a.com", "b@b.com"] });
      }
    );

    renderDialog();
    fireEvent.click(screen.getByTestId("create-leads-button"));

    await waitFor(() => {
      expect(screen.getByTestId("duplicate-info")).toBeInTheDocument();
    });

    expect(screen.getByTestId("duplicate-info")).toHaveTextContent(/2 contatos já existem/);
    expect(screen.getByTestId("duplicate-info")).toHaveTextContent("a@a.com");
    expect(screen.getByTestId("duplicate-info")).toHaveTextContent("b@b.com");
  });

  // --- SEGMENT DROPDOWN (AC #5) ---

  it("shows segment dropdown after successful creation with leads", async () => {
    mockCreateLeads.mockImplementation(
      (_params: unknown, options: { onSuccess: (data: { created: number; skipped: number; duplicateEmails: string[] }) => void }) => {
        options.onSuccess({ created: 2, skipped: 0, duplicateEmails: [] });
      }
    );

    renderDialog();
    fireEvent.click(screen.getByTestId("create-leads-button"));

    await waitFor(() => {
      expect(screen.getByTestId("segment-select")).toBeInTheDocument();
    });

    expect(screen.getByText("Adicionar a um segmento?")).toBeInTheDocument();
  });

  // --- ERROR HANDLING ---

  it("returns to confirm step on creation error", async () => {
    mockCreateLeads.mockImplementation(
      (_params: unknown, options: { onError: (error: Error) => void }) => {
        options.onError(new Error("Erro ao criar leads"));
      }
    );

    renderDialog();
    fireEvent.click(screen.getByTestId("create-leads-button"));

    await waitFor(() => {
      expect(screen.getByTestId("create-leads-button")).toBeInTheDocument();
    });

    expect(screen.queryByText("Criando leads...")).not.toBeInTheDocument();
  });

  // --- FECHAR BUTTON ---

  it("shows Fechar button on result step", async () => {
    mockCreateLeads.mockImplementation(
      (_params: unknown, options: { onSuccess: (data: { created: number; skipped: number; duplicateEmails: string[] }) => void }) => {
        options.onSuccess({ created: 2, skipped: 0, duplicateEmails: [] });
      }
    );

    renderDialog();
    fireEvent.click(screen.getByTestId("create-leads-button"));

    await waitFor(() => {
      expect(screen.getByTestId("close-dialog-button")).toBeInTheDocument();
    });

    expect(screen.getByTestId("close-dialog-button")).toHaveTextContent("Fechar");
  });
});
