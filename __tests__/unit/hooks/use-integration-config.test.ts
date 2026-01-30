import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useIntegrationConfig } from '@/hooks/use-integration-config'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { toast } from 'sonner'

describe('useIntegrationConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Initial State', () => {
    it('should return configs with all integrations not configured', () => {
      const { result } = renderHook(() => useIntegrationConfig())

      expect(result.current.configs.apollo.status).toBe('not_configured')
      expect(result.current.configs.signalhire.status).toBe('not_configured')
      expect(result.current.configs.snovio.status).toBe('not_configured')
      expect(result.current.configs.instantly.status).toBe('not_configured')
    })

    it('should return saveConfig function', () => {
      const { result } = renderHook(() => useIntegrationConfig())

      expect(typeof result.current.saveConfig).toBe('function')
    })
  })

  describe('saveConfig', () => {
    it('should update config status to configured after save', async () => {
      const { result } = renderHook(() => useIntegrationConfig())

      await act(async () => {
        const savePromise = result.current.saveConfig('apollo', 'valid-api-key-12345')
        vi.advanceTimersByTime(500)
        await savePromise
      })

      expect(result.current.configs.apollo.status).toBe('configured')
    })

    it('should mask the API key showing only last 4 chars', async () => {
      const { result } = renderHook(() => useIntegrationConfig())

      await act(async () => {
        const savePromise = result.current.saveConfig('apollo', 'my-secret-key-1234')
        vi.advanceTimersByTime(500)
        await savePromise
      })

      expect(result.current.configs.apollo.maskedKey).toMatch(/•+1234$/)
    })

    it('should show success toast on successful save', async () => {
      const { result } = renderHook(() => useIntegrationConfig())

      await act(async () => {
        const savePromise = result.current.saveConfig('signalhire', 'valid-api-key-12345')
        vi.advanceTimersByTime(500)
        await savePromise
      })

      expect(toast.success).toHaveBeenCalledWith('Configuração salva com sucesso', expect.any(Object))
    })

    it('should show error toast for short API key', async () => {
      const { result } = renderHook(() => useIntegrationConfig())

      await act(async () => {
        await result.current.saveConfig('apollo', 'short')
      })

      expect(toast.error).toHaveBeenCalledWith('API key muito curta', expect.any(Object))
    })

    it('should not update config for invalid API key', async () => {
      const { result } = renderHook(() => useIntegrationConfig())

      await act(async () => {
        await result.current.saveConfig('apollo', 'short')
      })

      expect(result.current.configs.apollo.status).toBe('not_configured')
    })

    it('should handle multiple integrations independently', async () => {
      const { result } = renderHook(() => useIntegrationConfig())

      await act(async () => {
        const savePromise = result.current.saveConfig('apollo', 'apollo-api-key-12345')
        vi.advanceTimersByTime(500)
        await savePromise
      })

      await act(async () => {
        const savePromise = result.current.saveConfig('instantly', 'instantly-api-key-67890')
        vi.advanceTimersByTime(500)
        await savePromise
      })

      expect(result.current.configs.apollo.status).toBe('configured')
      expect(result.current.configs.instantly.status).toBe('configured')
      expect(result.current.configs.signalhire.status).toBe('not_configured')
      expect(result.current.configs.snovio.status).toBe('not_configured')
    })

    it('should include integration name in success toast', async () => {
      const { result } = renderHook(() => useIntegrationConfig())

      await act(async () => {
        const savePromise = result.current.saveConfig('instantly', 'valid-api-key-12345')
        vi.advanceTimersByTime(500)
        await savePromise
      })

      expect(toast.success).toHaveBeenCalledWith(
        'Configuração salva com sucesso',
        expect.objectContaining({
          description: expect.stringContaining('instantly'),
        })
      )
    })
  })

  describe('API Key Validation', () => {
    it('should reject API key with less than 10 characters', async () => {
      const { result } = renderHook(() => useIntegrationConfig())

      await act(async () => {
        await result.current.saveConfig('apollo', '123456789') // 9 chars
      })

      expect(toast.error).toHaveBeenCalled()
      expect(result.current.configs.apollo.status).toBe('not_configured')
    })

    it('should accept API key with exactly 10 characters', async () => {
      const { result } = renderHook(() => useIntegrationConfig())

      await act(async () => {
        const savePromise = result.current.saveConfig('apollo', '1234567890') // 10 chars
        vi.advanceTimersByTime(500)
        await savePromise
      })

      expect(result.current.configs.apollo.status).toBe('configured')
    })

    it('should accept API key with more than 10 characters', async () => {
      const { result } = renderHook(() => useIntegrationConfig())

      await act(async () => {
        const savePromise = result.current.saveConfig('apollo', 'this-is-a-long-api-key')
        vi.advanceTimersByTime(500)
        await savePromise
      })

      expect(result.current.configs.apollo.status).toBe('configured')
    })
  })
})
