import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminGuard } from '@/components/settings/AdminGuard'

// Mock Supabase client
const mockGetUser = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  }),
}))

describe('AdminGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ single: mockSingle })
  })

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      mockGetUser.mockImplementation(() => new Promise(() => {}))

      const { container } = render(
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      )

      // Should show spinner, not content
      expect(container.querySelector('.animate-spin')).toBeInTheDocument()
      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
    })
  })

  describe('Admin Access', () => {
    it('should render children when user is admin', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: { role: 'admin' },
      })

      render(
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })
    })

    it('should query profiles table with correct user ID', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: { role: 'admin' },
      })

      render(
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      )

      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalledWith('profiles')
        expect(mockSelect).toHaveBeenCalledWith('role')
        expect(mockEq).toHaveBeenCalledWith('id', 'user-123')
      })
    })
  })

  describe('Non-Admin Access', () => {
    it('should show access denied when user is not admin', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: { role: 'user' },
      })

      render(
        <AdminGuard fallback={<div>Access Denied</div>}>
          <div>Admin Content</div>
        </AdminGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument()
        expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
      })
    })

    it('should render fallback when user is not authenticated', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
      })

      render(
        <AdminGuard fallback={<div>Please login</div>}>
          <div>Admin Content</div>
        </AdminGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Please login')).toBeInTheDocument()
        expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
      })
    })

    it('should render fallback when profile not found', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: null,
      })

      render(
        <AdminGuard fallback={<div>No profile</div>}>
          <div>Admin Content</div>
        </AdminGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('No profile')).toBeInTheDocument()
      })
    })
  })

  describe('Fallback Prop', () => {
    it('should render nothing when fallback not provided and user is not admin', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: { role: 'user' },
      })

      const { container } = render(
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      )

      await waitFor(() => {
        expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
        expect(container.textContent).toBe('')
      })
    })

    it('should render custom fallback content', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: { role: 'user' },
      })

      render(
        <AdminGuard fallback={<div data-testid="custom-fallback">Custom message</div>}>
          <div>Admin Content</div>
        </AdminGuard>
      )

      await waitFor(() => {
        expect(screen.getByTestId('custom-fallback')).toBeInTheDocument()
      })
    })
  })
})
