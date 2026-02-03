/**
 * DeleteCampaignDialog Tests
 * Delete Campaign UI
 *
 * AC: #1 - Opens dialog when user clicks "Remover" option
 * AC: #2 - Deletes campaign and updates list when confirmed
 * AC: #3 - Dialog closes without deleting when "Cancelar" clicked
 * AC: #4 - Shows loading state during delete
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteCampaignDialog } from "@/components/campaigns/DeleteCampaignDialog";
import type { CampaignWithCount } from "@/types/campaign";

describe("DeleteCampaignDialog", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnConfirm = vi.fn();

  const mockCampaign: CampaignWithCount = {
    id: "campaign-1",
    tenantId: "tenant-1",
    name: "Test Campaign",
    status: "draft",
    createdAt: "2026-02-01T10:00:00Z",
    updatedAt: "2026-02-01T10:00:00Z",
    leadCount: 0,
    productId: null,
    productName: null,
  };

  const campaignWithLeads: CampaignWithCount = {
    ...mockCampaign,
    id: "campaign-2",
    name: "Campaign with Leads",
    leadCount: 25,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConfirm.mockResolvedValue(undefined);
  });

  // ==============================================
  // DIALOG VISIBILITY
  // ==============================================

  describe("dialog visibility", () => {
    it("should not render when not open", () => {
      render(
        <DeleteCampaignDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("should render when open", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  // ==============================================
  // DIALOG CONTENT (AC: #1)
  // ==============================================

  describe("dialog content", () => {
    it("should show correct title", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(screen.getByText("Remover campanha?")).toBeInTheDocument();
    });

    it("should show campaign name in description", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(screen.getByText(/"Test Campaign"/)).toBeInTheDocument();
    });

    it("should show warning about permanent deletion", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(
        screen.getByText(/Esta ação não pode ser desfeita/i)
      ).toBeInTheDocument();
    });

    it("should show Cancelar and Remover buttons", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(screen.getByRole("button", { name: /Cancelar/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Remover/i })).toBeInTheDocument();
    });
  });

  // ==============================================
  // LEADS WARNING
  // ==============================================

  describe("leads warning", () => {
    it("should NOT show leads warning when campaign has no leads", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(screen.queryByText(/leads associados/i)).not.toBeInTheDocument();
    });

    it("should show leads warning when campaign has leads", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={campaignWithLeads}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(screen.getByText(/25 leads associados/i)).toBeInTheDocument();
    });

    it("should use singular for 1 lead", () => {
      const campaignWith1Lead = { ...mockCampaign, leadCount: 1 };

      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={campaignWith1Lead}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(screen.getByText(/1 lead associado/i)).toBeInTheDocument();
    });
  });

  // ==============================================
  // CONFIRM ACTION (AC: #2)
  // ==============================================

  describe("confirm action", () => {
    it("should call onConfirm when clicking Remover", async () => {
      const user = userEvent.setup();

      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      await user.click(screen.getByRole("button", { name: /Remover/i }));

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });
  });

  // ==============================================
  // CANCEL ACTION (AC: #3)
  // ==============================================

  describe("cancel action", () => {
    it("should call onOpenChange(false) when clicking Cancelar", async () => {
      const user = userEvent.setup();

      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      await user.click(screen.getByRole("button", { name: /Cancelar/i }));

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("should NOT call onConfirm when clicking Cancelar", async () => {
      const user = userEvent.setup();

      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      await user.click(screen.getByRole("button", { name: /Cancelar/i }));

      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // LOADING STATE (AC: #4)
  // ==============================================

  describe("loading state", () => {
    it("should show loading spinner when isDeleting is true", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={true}
        />
      );

      expect(screen.getByText(/Removendo.../i)).toBeInTheDocument();
    });

    it("should disable Cancelar button when isDeleting is true", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={true}
        />
      );

      expect(screen.getByRole("button", { name: /Cancelar/i })).toBeDisabled();
    });

    it("should disable Remover button when isDeleting is true", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={mockCampaign}
          onConfirm={mockOnConfirm}
          isDeleting={true}
        />
      );

      expect(screen.getByText(/Removendo.../i).closest("button")).toBeDisabled();
    });
  });

  // ==============================================
  // NULL CAMPAIGN HANDLING (F8 FIX)
  // ==============================================

  describe("null campaign handling", () => {
    it("should not crash with null campaign", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={null}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    it("should show fallback name when campaign is null", () => {
      render(
        <DeleteCampaignDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          campaign={null}
          onConfirm={mockOnConfirm}
          isDeleting={false}
        />
      );

      expect(screen.getByText(/"esta campanha"/)).toBeInTheDocument();
    });
  });
});
