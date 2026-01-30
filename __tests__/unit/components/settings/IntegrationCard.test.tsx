import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IntegrationCard } from '@/components/settings/IntegrationCard'

describe('IntegrationCard', () => {
  const defaultProps = {
    name: 'apollo' as const,
    displayName: 'Apollo',
    icon: '🔗',
    description: 'Busca de leads',
    status: 'not_configured' as const,
    onSave: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render with correct integration name', () => {
      render(<IntegrationCard {...defaultProps} />)

      expect(screen.getByText('Apollo')).toBeInTheDocument()
    })

    it('should render with icon', () => {
      render(<IntegrationCard {...defaultProps} />)

      expect(screen.getByText('🔗')).toBeInTheDocument()
    })

    it('should render description', () => {
      render(<IntegrationCard {...defaultProps} />)

      expect(screen.getByText('Busca de leads')).toBeInTheDocument()
    })

    it('should render API key label', () => {
      render(<IntegrationCard {...defaultProps} />)

      expect(screen.getByText('API Key')).toBeInTheDocument()
    })

    it('should render save button', () => {
      render(<IntegrationCard {...defaultProps} />)

      expect(screen.getByRole('button', { name: /salvar/i })).toBeInTheDocument()
    })
  })

  describe('Status Badge', () => {
    it('should show "Não configurado" badge when status is not_configured', () => {
      render(<IntegrationCard {...defaultProps} status="not_configured" />)

      expect(screen.getByText('Não configurado')).toBeInTheDocument()
    })

    it('should show "Configurado" badge when status is configured', () => {
      render(<IntegrationCard {...defaultProps} status="configured" />)

      expect(screen.getByText('Configurado')).toBeInTheDocument()
    })

    it('should show "Erro" badge when status is error', () => {
      render(<IntegrationCard {...defaultProps} status="error" />)

      expect(screen.getByText('Erro')).toBeInTheDocument()
    })
  })

  describe('API Key Input', () => {
    it('should mask API key by default', () => {
      render(<IntegrationCard {...defaultProps} />)

      const input = screen.getByLabelText('API Key')
      expect(input).toHaveAttribute('type', 'password')
    })

    it('should reveal API key when eye button clicked', async () => {
      const user = userEvent.setup()
      render(<IntegrationCard {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /mostrar api key/i })
      await user.click(toggleButton)

      const input = screen.getByLabelText('API Key')
      expect(input).toHaveAttribute('type', 'text')
    })

    it('should hide API key when eye button clicked again', async () => {
      const user = userEvent.setup()
      render(<IntegrationCard {...defaultProps} />)

      const toggleButton = screen.getByRole('button', { name: /mostrar api key/i })
      await user.click(toggleButton)
      await user.click(toggleButton)

      const input = screen.getByLabelText('API Key')
      expect(input).toHaveAttribute('type', 'password')
    })

    it('should display current masked key if provided', () => {
      render(<IntegrationCard {...defaultProps} currentKey="••••••••1234" />)

      const input = screen.getByLabelText('API Key')
      expect(input).toHaveValue('••••••••1234')
    })
  })

  describe('Save Button', () => {
    it('should disable save button when input is empty', () => {
      render(<IntegrationCard {...defaultProps} />)

      expect(screen.getByRole('button', { name: /salvar/i })).toBeDisabled()
    })

    it('should enable save button when API key is entered', async () => {
      const user = userEvent.setup()
      render(<IntegrationCard {...defaultProps} />)

      const input = screen.getByLabelText('API Key')
      await user.type(input, 'test-api-key-12345')

      expect(screen.getByRole('button', { name: /salvar/i })).toBeEnabled()
    })

    it('should call onSave with key value when form submitted', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn().mockResolvedValue(undefined)
      render(<IntegrationCard {...defaultProps} onSave={onSave} />)

      const input = screen.getByLabelText('API Key')
      await user.type(input, 'test-api-key-12345')
      await user.click(screen.getByRole('button', { name: /salvar/i }))

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('test-api-key-12345')
      })
    })

    it('should show loading state while saving', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
      render(<IntegrationCard {...defaultProps} onSave={onSave} />)

      const input = screen.getByLabelText('API Key')
      await user.type(input, 'test-api-key-12345')
      await user.click(screen.getByRole('button', { name: /salvar/i }))

      expect(screen.getByText(/salvando/i)).toBeInTheDocument()
    })

    it('should submit on Enter key press', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn().mockResolvedValue(undefined)
      render(<IntegrationCard {...defaultProps} onSave={onSave} />)

      const input = screen.getByLabelText('API Key')
      await user.type(input, 'test-api-key-12345{Enter}')

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('test-api-key-12345')
      })
    })
  })

  describe('Last Update Text', () => {
    it('should show "Nunca" when not configured', () => {
      render(<IntegrationCard {...defaultProps} status="not_configured" />)

      expect(screen.getByText(/última atualização: nunca/i)).toBeInTheDocument()
    })

    it('should show "Sessão atual" when configured', () => {
      render(<IntegrationCard {...defaultProps} status="configured" />)

      expect(screen.getByText(/última atualização: sessão atual/i)).toBeInTheDocument()
    })
  })
})
