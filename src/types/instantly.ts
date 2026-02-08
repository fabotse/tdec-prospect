/**
 * Instantly API v2 Types
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 * AC: #1, #2, #3, #4 - Types for campaign creation, lead management, and status
 */

// ==============================================
// CAMPAIGN STATUS ENUM (AC: #4)
// ==============================================

export enum InstantlyCampaignStatus {
  Draft = 0,
  Active = 1,
  Paused = 2,
  Completed = 3,
  RunningSubsequences = 4,
  AccountSuspended = -99,
  AccountsUnhealthy = -1,
  BounceProtect = -2,
}

// ==============================================
// CAMPAIGN CREATION TYPES (AC: #2)
// ==============================================

/**
 * Schedule configuration for campaign sending
 * Defaults: horário comercial brasileiro (09-17, seg-sex)
 */
export interface InstantlyCampaignSchedule {
  schedules: Array<{
    name: string;
    timing: {
      from: string;
      to: string;
    };
    days: Record<string, boolean>;
    timezone: string;
  }>;
}

/**
 * Single email variant within a sequence step
 */
export interface InstantlyVariant {
  subject: string;
  body: string;
}

/**
 * A step in the email sequence (each EmailBlock becomes one step)
 */
export interface InstantlySequenceStep {
  type: "email";
  delay: number;
  variants: InstantlyVariant[];
}

/**
 * Request body for POST /api/v2/campaigns
 */
export interface CreateCampaignRequest {
  name: string;
  campaign_schedule: InstantlyCampaignSchedule;
  sequences: Array<{
    steps: InstantlySequenceStep[];
  }>;
  /** List of sending account emails to associate with the campaign */
  email_list?: string[];
  /** Stop sending follow-ups when lead replies */
  stop_on_reply?: boolean;
  /** Enable open tracking */
  open_tracking?: boolean;
  /** Enable link/click tracking */
  link_tracking?: boolean;
}

/**
 * Response from POST /api/v2/campaigns
 */
export interface CreateCampaignResponse {
  id: string;
  name: string;
  status: number;
}

// ==============================================
// LEAD TYPES (AC: #3)
// ==============================================

/**
 * Single lead in Instantly format for bulk add
 * Native fields: email, first_name, last_name, company_name, phone
 * Custom fields go in custom_variables
 */
export interface InstantlyLead {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone?: string;
  custom_variables?: Record<string, string | number | boolean | null>;
}

/**
 * Request body for POST /api/v2/leads/add
 */
export interface BulkAddLeadsRequest {
  campaign_id: string;
  skip_if_in_campaign: boolean;
  verify_leads_on_import: boolean;
  leads: InstantlyLead[];
}

/**
 * Response from POST /api/v2/leads/add
 */
export interface BulkAddLeadsResponse {
  status: string;
  leads_uploaded: number;
  duplicated_leads: number;
  invalid_email_count: number;
  remaining_in_plan: number;
  created_leads: Array<{
    id: string;
    email: string;
    index: number;
  }>;
}

// ==============================================
// CAMPAIGN STATUS/ACTIVATE TYPES (AC: #4)
// ==============================================

/**
 * Response from POST /api/v2/campaigns/{id}/activate
 */
export interface ActivateCampaignResponse {
  success: boolean;
}

/**
 * Response from GET /api/v2/campaigns/{id}
 */
export interface GetCampaignResponse {
  id: string;
  name: string;
  status: number;
}

// ==============================================
// ACCOUNT TYPES (Story 7.4: AC #4)
// ==============================================

/**
 * Single sending account in Instantly
 * Story 7.4: AC #4 - Sending account selection
 */
export interface InstantlyAccountItem {
  email: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Response from GET /api/v2/accounts
 */
export interface ListAccountsResponse {
  items: InstantlyAccountItem[];
  total_count: number;
}

/**
 * Parameters for InstantlyService.listAccounts()
 */
export interface ListAccountsParams {
  apiKey: string;
  limit?: number;
}

/**
 * Result from InstantlyService.listAccounts()
 */
export interface ListAccountsResult {
  accounts: InstantlyAccountItem[];
  totalCount: number;
}

// ==============================================
// ACCOUNT CAMPAIGN MAPPING TYPES (Story 7.5: AC #1)
// ==============================================

/**
 * Request body for POST /api/v2/account-campaign-mappings
 * Story 7.5: Associates a sending account with a campaign
 */
export interface AccountCampaignMappingRequest {
  campaign_id: string;
  email_account: string;
}

/**
 * Response from POST /api/v2/account-campaign-mappings
 */
export interface AccountCampaignMappingResponse {
  campaign_id: string;
  email_account: string;
  status: string;
}

/**
 * Parameters for InstantlyService.addAccountsToCampaign()
 * Story 7.5: AC #1 - Associate sending accounts with campaign
 */
export interface AddAccountsParams {
  apiKey: string;
  campaignId: string;
  accountEmails: string[];
}

/**
 * Result from InstantlyService.addAccountsToCampaign()
 */
export interface AddAccountsResult {
  success: boolean;
  accountsAdded: number;
}

// ==============================================
// SERVICE PARAM/RESULT TYPES
// ==============================================

/**
 * Parameters for InstantlyService.createCampaign()
 */
export interface CreateCampaignParams {
  apiKey: string;
  name: string;
  sequences: Array<{
    subject: string;
    body: string;
    delayDays: number;
  }>;
  /** Sending account emails to associate with the campaign at creation */
  sendingAccounts?: string[];
}

/**
 * Result from InstantlyService.createCampaign()
 */
export interface CreateCampaignResult {
  campaignId: string;
  name: string;
  status: number;
}

/**
 * Parameters for InstantlyService.addLeadsToCampaign()
 */
export interface AddLeadsParams {
  apiKey: string;
  campaignId: string;
  leads: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    phone?: string;
    title?: string;
    icebreaker?: string;
  }>;
}

/**
 * Result from InstantlyService.addLeadsToCampaign()
 */
export interface AddLeadsResult {
  leadsUploaded: number;
  duplicatedLeads: number;
  invalidEmails: number;
  remainingInPlan: number;
}

/**
 * Parameters for InstantlyService.activateCampaign()
 */
export interface ActivateCampaignParams {
  apiKey: string;
  campaignId: string;
}

/**
 * Result from InstantlyService.activateCampaign()
 */
export interface ActivateResult {
  success: boolean;
}

/**
 * Parameters for InstantlyService.getCampaignStatus()
 */
export interface GetCampaignStatusParams {
  apiKey: string;
  campaignId: string;
}

/**
 * Result from InstantlyService.getCampaignStatus()
 */
export interface CampaignStatusResult {
  campaignId: string;
  name: string;
  status: number;
  statusLabel: string;
}
