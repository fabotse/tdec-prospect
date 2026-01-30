import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from '@/components/common/Sidebar'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/leads'),
}))

describe('Sidebar', () => {
  const defaultProps = {
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
    width: 240,
    isHydrated: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render sidebar with navigation role', () => {
      render(<Sidebar {...defaultProps} />)

      expect(screen.getByRole('navigation', { name: /sidebar/i })).toBeInTheDocument()
    })

    it('should render all navigation items with labels', () => {
      render(<Sidebar {...defaultProps} />)

      expect(screen.getByRole('link', { name: /leads/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /campanhas/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /configurações/i })).toBeInTheDocument()
    })

    it('should render navigation items with correct hrefs', () => {
      render(<Sidebar {...defaultProps} />)

      expect(screen.getByRole('link', { name: /leads/i })).toHaveAttribute('href', '/leads')
      expect(screen.getByRole('link', { name: /campanhas/i })).toHaveAttribute('href', '/campaigns')
      expect(screen.getByRole('link', { name: /configurações/i })).toHaveAttribute('href', '/settings')
    })

    it('should render collapse button with correct aria-label when expanded', () => {
      render(<Sidebar {...defaultProps} />)

      expect(screen.getByRole('button', { name: /recolher sidebar/i })).toBeInTheDocument()
    })

    it('should render collapse button with correct aria-label when collapsed', () => {
      render(<Sidebar {...defaultProps} isCollapsed={true} width={64} />)

      expect(screen.getByRole('button', { name: /expandir sidebar/i })).toBeInTheDocument()
    })
  })

  describe('Width', () => {
    it('should apply expanded width style', () => {
      render(<Sidebar {...defaultProps} width={240} />)

      const sidebar = screen.getByRole('navigation', { name: /sidebar/i }).closest('aside')
      expect(sidebar).toHaveStyle({ width: '240px' })
    })

    it('should apply collapsed width style', () => {
      render(<Sidebar {...defaultProps} isCollapsed={true} width={64} />)

      const sidebar = screen.getByRole('navigation', { name: /sidebar/i }).closest('aside')
      expect(sidebar).toHaveStyle({ width: '64px' })
    })
  })

  describe('Collapsed State', () => {
    it('should hide labels when collapsed', () => {
      render(<Sidebar {...defaultProps} isCollapsed={true} width={64} />)

      // Labels should not be visible when collapsed
      expect(screen.queryByText('Leads')).not.toBeInTheDocument()
      expect(screen.queryByText('Campanhas')).not.toBeInTheDocument()
      expect(screen.queryByText('Configurações')).not.toBeInTheDocument()
    })

    it('should show labels when expanded', () => {
      render(<Sidebar {...defaultProps} isCollapsed={false} width={240} />)

      expect(screen.getByText('Leads')).toBeInTheDocument()
      expect(screen.getByText('Campanhas')).toBeInTheDocument()
      expect(screen.getByText('Configurações')).toBeInTheDocument()
    })
  })

  describe('Collapse Toggle', () => {
    it('should call onToggleCollapse when collapse button clicked', async () => {
      const user = userEvent.setup()
      const onToggleCollapse = vi.fn()

      render(<Sidebar {...defaultProps} onToggleCollapse={onToggleCollapse} />)

      await user.click(screen.getByRole('button', { name: /recolher sidebar/i }))

      expect(onToggleCollapse).toHaveBeenCalledTimes(1)
    })
  })

  describe('Active Route', () => {
    it('should mark active route with aria-current', () => {
      render(<Sidebar {...defaultProps} />)

      // /leads is active (mocked)
      expect(screen.getByRole('link', { name: /leads/i })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: /campanhas/i })).not.toHaveAttribute('aria-current')
    })

    it('should apply active styling classes to current route', () => {
      render(<Sidebar {...defaultProps} />)

      const leadsLink = screen.getByRole('link', { name: /leads/i })
      expect(leadsLink.className).toContain('bg-sidebar-accent')
    })
  })

  describe('Accessibility', () => {
    it('should have accessible navigation landmark', () => {
      render(<Sidebar {...defaultProps} />)

      const nav = screen.getByRole('navigation')
      expect(nav).toHaveAttribute('aria-label', 'Sidebar navigation')
    })

    it('should have focusable navigation items', () => {
      render(<Sidebar {...defaultProps} />)

      const links = screen.getAllByRole('link')
      links.forEach(link => {
        expect(link).not.toHaveAttribute('tabindex', '-1')
      })
    })
  })

  describe('Transitions', () => {
    it('should apply transition when hydrated', () => {
      render(<Sidebar {...defaultProps} isHydrated={true} />)

      const sidebar = screen.getByRole('navigation', { name: /sidebar/i }).closest('aside') as HTMLElement
      expect(sidebar.style.transition).toContain('200ms')
    })

    it('should not apply transition when not hydrated', () => {
      render(<Sidebar {...defaultProps} isHydrated={false} />)

      const sidebar = screen.getByRole('navigation', { name: /sidebar/i }).closest('aside')
      expect(sidebar).toHaveStyle({ transition: 'none' })
    })
  })
})
