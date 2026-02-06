# Epic 4 - Lead Persistence & My Leads Planning

## Problem Statement

During Story 4.2 (Lead Status Management) implementation, we identified a critical gap:

**Current Flow:**
1. User searches Apollo API → leads returned (in-memory only)
2. Leads displayed in table with status dropdown
3. User tries to change status → **ERROR** (lead doesn't exist in DB)

**Expected Flow:**
1. User searches Apollo → results displayed
2. User imports/saves leads they want to work with
3. Saved leads appear in "Meus Leads" page
4. Status management, phone lookup, etc. work on persisted leads

## Root Cause Analysis

- Apollo search results are transient (not persisted)
- LeadStatusDropdown assumes leads exist in `leads` table
- No dedicated view for persisted leads
- No explicit "import" action in the UX
- Story 4.1 (Segments) already has upsert logic but it's tied to segment creation

## Proposed Solution

Create new stories to establish proper lead persistence architecture:

---

## Story 4.2.1: Lead Import Mechanism (NEW)

**As a** user,
**I want to** import leads from Apollo search results to my database,
**So that** I can manage their status, look up phone numbers, and track them over time.

### Acceptance Criteria

1. **AC #1 - Import Button in Selection Bar**
   - Given I have leads selected from Apollo search
   - When I see the selection bar
   - Then I see an "Importar Leads" button (primary action)
   - And clicking it saves selected leads to the database

2. **AC #2 - Auto-Import on Status Change**
   - Given I click on a status dropdown for an unsaved lead
   - When I select a new status
   - Then the lead is automatically created in the database
   - And the status is set to the selected value
   - And I see success toast "Lead importado e status atualizado"

3. **AC #3 - Visual Indicator for Saved vs Unsaved**
   - Given leads are displayed in the table
   - When some leads are saved and some are not
   - Then saved leads show a small indicator (e.g., checkmark icon, subtle badge)
   - And unsaved leads show no indicator (or "Apollo" badge)

4. **AC #4 - Bulk Import**
   - Given I have multiple leads selected
   - When I click "Importar Leads"
   - Then all selected leads are saved to the database
   - And I see success toast "X leads importados"

5. **AC #5 - Prevent Duplicates**
   - Given a lead already exists in the database (by apollo_id)
   - When I try to import it again
   - Then it is not duplicated (upsert behavior)
   - And existing data is preserved

### Technical Notes

- Reuse upsert logic from `/api/segments/[segmentId]/leads` route
- Create new `/api/leads/import` endpoint for bulk import
- Add `isImported` computed property based on presence of DB id vs apollo_id
- Update LeadStatusDropdown to handle upsert-on-change

---

## Story 4.2.2: My Leads Page (NEW)

**As a** user,
**I want to** see all my imported leads in a dedicated page,
**So that** I can manage and track leads I've decided to pursue.

### Acceptance Criteria

1. **AC #1 - Navigation Submenu**
   - Given I am on the application
   - When I look at the sidebar
   - Then "Leads" expands to show submenu items:
     - "Buscar" (current search page, /leads)
     - "Meus Leads" (new page, /leads/my-leads)

2. **AC #2 - My Leads Page Structure**
   - Given I navigate to "Meus Leads"
   - When the page loads
   - Then I see my saved leads in a table
   - And the table shows: Nome, Empresa, Cargo, Contato, Status, Importado em
   - And I can sort and filter leads

3. **AC #3 - Status Filter for My Leads**
   - Given I am on "Meus Leads"
   - When I open the filter panel
   - Then I can filter by status (Novo, Em Campanha, Interessado, Oportunidade, Não Interessado)
   - And I can filter by segment
   - And I can search by name/company

4. **AC #4 - Inline Status Edit**
   - Given I am viewing my leads
   - When I click on a status badge
   - Then I can change the status inline
   - And the change is saved immediately (leads already exist in DB)

5. **AC #5 - Lead Actions**
   - Given I select leads in "Meus Leads"
   - When I see the selection bar
   - Then I can: Alterar Status, Adicionar ao Segmento, Buscar Telefone (future)

6. **AC #6 - Empty State**
   - Given I have no imported leads
   - When I visit "Meus Leads"
   - Then I see friendly empty state
   - And I see CTA to go to search and import leads

### Technical Notes

- Create `/leads/my-leads/page.tsx`
- Create `useMyLeads` hook querying `leads` table directly
- Reuse LeadTable component with different data source
- Update Sidebar to support expandable navigation items

---

## Story 4.2.3: Sidebar Navigation Enhancement (NEW)

**As a** user,
**I want to** navigate easily between lead search and my leads,
**So that** I have clear separation between discovery and management.

### Acceptance Criteria

1. **AC #1 - Expandable Menu Item**
   - Given I look at the sidebar
   - When "Leads" is present
   - Then it shows a chevron indicating expandable submenu
   - And clicking expands to show sub-items

2. **AC #2 - Submenu Items**
   - Given the Leads menu is expanded
   - Then I see:
     - "Buscar" with Search icon → /leads
     - "Meus Leads" with Database/Folder icon → /leads/my-leads

3. **AC #3 - Active State**
   - Given I am on any leads page
   - When I look at the sidebar
   - Then the parent "Leads" item is highlighted
   - And the specific sub-item is also highlighted

4. **AC #4 - Collapsed State**
   - Given sidebar is collapsed
   - When I hover over Leads icon
   - Then a flyout shows the submenu options

### Technical Notes

- Update Sidebar.tsx to support nested navigation
- Consider using Radix Collapsible or custom implementation
- Maintain keyboard accessibility

---

## Story Sequencing

### Recommended Order

1. **Story 4.2.1** (Lead Import Mechanism) - **FIRST**
   - Fixes the immediate bug in 4.2
   - Establishes persistence pattern
   - Minimal UI changes

2. **Story 4.2.3** (Sidebar Navigation) - **SECOND**
   - Prepares navigation for new page
   - Can be done in parallel with 4.2.2

3. **Story 4.2.2** (My Leads Page) - **THIRD**
   - Depends on import mechanism existing
   - Depends on navigation being ready

### Impact on Existing Stories

| Story | Impact |
|-------|--------|
| 4.2 Lead Status | Needs 4.2.1 to work properly |
| 4.3 Lead Detail | Should work from "Meus Leads" page |
| 4.4 SignalHire | Integration used from "Meus Leads" |
| 4.5 Phone Lookup | Requires persisted leads |
| 4.6 Interested Highlighting | Works on "Meus Leads" page |
| 4.7 Import Results | Imports to "Meus Leads" |

---

## Database Considerations

The `leads` table already exists with correct structure:
- `id` (UUID, primary key)
- `tenant_id` (tenant isolation)
- `apollo_id` (unique per tenant for dedup)
- `status` (default 'novo')
- All lead fields (name, email, company, etc.)

No schema changes required.

---

## API Endpoints Needed

### New Endpoints

1. `POST /api/leads/import`
   - Bulk import leads from Apollo
   - Same logic as segment leads but without segment association

2. `GET /api/leads` (may already exist partially)
   - Fetch persisted leads for "Meus Leads" page
   - Support pagination, filtering, sorting

### Modified Endpoints

1. `PATCH /api/leads/[leadId]/status`
   - Add upsert behavior: if lead doesn't exist, create first
   - Accept full lead data for creation

---

## Summary

| Story | Title | Priority | Estimate |
|-------|-------|----------|----------|
| 4.2.1 | Lead Import Mechanism | P0 (blocks 4.2) | Medium |
| 4.2.2 | My Leads Page | P1 | Large |
| 4.2.3 | Sidebar Navigation Enhancement | P1 | Small |

These stories should be inserted into Epic 4 immediately after 4.2, as they enable the proper functioning of status management and all subsequent lead management features.

---

## Next Steps

1. PM/SM to review this planning document
2. Create formal story files for each proposed story
3. Update epics.md with new stories
4. Prioritize in sprint-status.yaml
5. Begin implementation with 4.2.1

---

*Planning created: 2026-01-31*
*Context: During Story 4.2 implementation, identified architectural gap in lead persistence*
