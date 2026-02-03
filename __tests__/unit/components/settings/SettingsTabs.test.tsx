import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SettingsTabs } from '@/components/settings/SettingsTabs'

// Mock next/navigation
const mockUsePathname = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

describe('SettingsTabs', () => {
  describe('Rendering', () => {
    it('should render all tabs', () => {
      mockUsePathname.mockReturnValue('/settings/integrations')

      render(<SettingsTabs />)

      expect(screen.getByRole('tab', { name: /integrações/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /base de conhecimento/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /produtos/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /equipe/i })).toBeInTheDocument()
    })

    it('should render navigation with tablist role', () => {
      mockUsePathname.mockReturnValue('/settings/integrations')

      render(<SettingsTabs />)

      expect(screen.getByRole('tablist')).toBeInTheDocument()
    })

    it('should render tabs with correct hrefs', () => {
      mockUsePathname.mockReturnValue('/settings/integrations')

      render(<SettingsTabs />)

      expect(screen.getByRole('tab', { name: /integrações/i })).toHaveAttribute('href', '/settings/integrations')
      expect(screen.getByRole('tab', { name: /base de conhecimento/i })).toHaveAttribute('href', '/settings/knowledge-base')
      expect(screen.getByRole('tab', { name: /produtos/i })).toHaveAttribute('href', '/settings/products')
      expect(screen.getByRole('tab', { name: /equipe/i })).toHaveAttribute('href', '/settings/team')
    })
  })

  describe('Active State', () => {
    it('should mark integrations tab as selected when on integrations page', () => {
      mockUsePathname.mockReturnValue('/settings/integrations')

      render(<SettingsTabs />)

      expect(screen.getByRole('tab', { name: /integrações/i })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: /base de conhecimento/i })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: /produtos/i })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: /equipe/i })).toHaveAttribute('aria-selected', 'false')
    })

    it('should mark knowledge-base tab as selected when on knowledge-base page', () => {
      mockUsePathname.mockReturnValue('/settings/knowledge-base')

      render(<SettingsTabs />)

      expect(screen.getByRole('tab', { name: /integrações/i })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: /base de conhecimento/i })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: /produtos/i })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: /equipe/i })).toHaveAttribute('aria-selected', 'false')
    })

    it('should mark products tab as selected when on products page', () => {
      mockUsePathname.mockReturnValue('/settings/products')

      render(<SettingsTabs />)

      expect(screen.getByRole('tab', { name: /integrações/i })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: /base de conhecimento/i })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: /produtos/i })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: /equipe/i })).toHaveAttribute('aria-selected', 'false')
    })

    it('should mark team tab as selected when on team page', () => {
      mockUsePathname.mockReturnValue('/settings/team')

      render(<SettingsTabs />)

      expect(screen.getByRole('tab', { name: /integrações/i })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: /base de conhecimento/i })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: /produtos/i })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: /equipe/i })).toHaveAttribute('aria-selected', 'true')
    })

    it('should apply active styling to selected tab', () => {
      mockUsePathname.mockReturnValue('/settings/integrations')

      render(<SettingsTabs />)

      const activeTab = screen.getByRole('tab', { name: /integrações/i })
      expect(activeTab.className).toContain('text-foreground')
    })

    it('should apply inactive styling to unselected tabs', () => {
      mockUsePathname.mockReturnValue('/settings/integrations')

      render(<SettingsTabs />)

      const inactiveTab = screen.getByRole('tab', { name: /base de conhecimento/i })
      expect(inactiveTab.className).toContain('text-foreground-muted')
    })
  })

  describe('Nested Routes', () => {
    it('should mark tab as active for nested routes', () => {
      mockUsePathname.mockReturnValue('/settings/knowledge-base/company')

      render(<SettingsTabs />)

      expect(screen.getByRole('tab', { name: /base de conhecimento/i })).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('Accessibility', () => {
    it('should have proper tab role for each link', () => {
      mockUsePathname.mockReturnValue('/settings/integrations')

      render(<SettingsTabs />)

      const tabs = screen.getAllByRole('tab')
      expect(tabs).toHaveLength(4)
    })

    it('should be keyboard accessible', () => {
      mockUsePathname.mockReturnValue('/settings/integrations')

      render(<SettingsTabs />)

      const tabs = screen.getAllByRole('tab')
      tabs.forEach(tab => {
        expect(tab).not.toHaveAttribute('tabindex', '-1')
      })
    })
  })
})
