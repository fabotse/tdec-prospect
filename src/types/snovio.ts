/**
 * Snov.io API Types
 * Story 7.3: Snov.io Integration Service - Gestão de Campanhas
 * AC: #1, #2, #3, #4, #5 - Types for list management, prospect handling, and campaigns
 */

// ==============================================
// AUTHENTICATION TYPES (AC: #1)
// ==============================================

/**
 * Response from POST /v1/oauth/access_token
 */
export interface SnovioTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// ==============================================
// LIST TYPES (AC: #2, #5)
// ==============================================

/**
 * Request body for POST /v1/add-list
 */
export interface CreateListRequest {
  access_token: string;
  name: string;
}

/**
 * Response from POST /v1/add-list
 */
export interface CreateListResponse {
  success: boolean;
  id: number;
  name: string;
}

/**
 * Single list item in GET /v1/get-user-lists response
 */
export interface SnovioList {
  id: number;
  name: string;
  contacts: number;
}

/**
 * Response from GET /v1/get-user-lists
 */
export interface GetUserListsResponse {
  success: boolean;
  data: SnovioList[];
}

// ==============================================
// PROSPECT TYPES (AC: #3)
// ==============================================

/**
 * Prospect in Snov.io format for add-prospect-to-list
 * Native fields use camelCase, custom fields use bracket notation
 */
export interface SnovioProspect {
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  position?: string;
  phones?: string[];
  "customFields[ice_breaker]"?: string;
}

/**
 * Request body for POST /v1/add-prospect-to-list
 * Includes access_token and listId in the body
 */
export interface AddProspectRequest extends SnovioProspect {
  access_token: string;
  listId: number;
  updateContact: boolean;
}

/**
 * Response from POST /v1/add-prospect-to-list
 */
export interface AddProspectResponse {
  success: boolean;
  added: boolean;
  updated: boolean;
}

// ==============================================
// CAMPAIGN TYPES (AC: #4)
// ==============================================

/**
 * Single campaign in GET /v1/get-user-campaigns response
 */
export interface SnovioCampaign {
  id: number;
  title: string;
  status: string;
}

/**
 * Response from GET /v1/get-user-campaigns
 */
export interface GetUserCampaignsResponse {
  success: boolean;
  data: SnovioCampaign[];
}

// ==============================================
// SERVICE PARAM/RESULT TYPES
// ==============================================

/**
 * Parameters for SnovioService.createProspectList()
 */
export interface CreateListParams {
  credentials: string;
  name: string;
}

/**
 * Result from SnovioService.createProspectList()
 */
export interface CreateListResult {
  listId: number;
  name: string;
}

/**
 * Parameters for SnovioService.addProspectToList() — single prospect
 */
export interface AddProspectParams {
  credentials: string;
  listId: number;
  lead: {
    email: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    title?: string;
    phone?: string;
    icebreaker?: string;
  };
}

/**
 * Result from SnovioService.addProspectToList()
 */
export interface AddProspectResult {
  success: boolean;
  added: boolean;
  updated: boolean;
}

/**
 * Parameters for SnovioService.addProspectsToList() — batch sequential
 */
export interface AddProspectsParams {
  credentials: string;
  listId: number;
  leads: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    title?: string;
    phone?: string;
    icebreaker?: string;
  }>;
}

/**
 * Result from SnovioService.addProspectsToList() — aggregated
 */
export interface AddProspectsResult {
  added: number;
  updated: number;
  errors: number;
  totalProcessed: number;
}

/**
 * Parameters for SnovioService.getUserCampaigns()
 */
export interface GetCampaignsParams {
  credentials: string;
}

/**
 * Result from SnovioService.getUserCampaigns()
 */
export interface GetCampaignsResult {
  campaigns: Array<{
    id: number;
    title: string;
    status: string;
  }>;
}

/**
 * Parameters for SnovioService.getUserLists()
 */
export interface GetListsParams {
  credentials: string;
}

/**
 * Result from SnovioService.getUserLists()
 */
export interface GetListsResult {
  lists: Array<{
    id: number;
    name: string;
    contacts: number;
  }>;
}
