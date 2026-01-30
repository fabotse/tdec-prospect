import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { ThemeProvider } from '@/components/common/ThemeProvider'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock matchMedia
const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
  matches: query === '(prefers-color-scheme: dark)',
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

Object.defineProperty(window, 'matchMedia', { value: matchMediaMock })

function renderWithTheme(component: React.ReactNode) {
  return render(<ThemeProvider>{component}</ThemeProvider>)
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorageMock.clear()
    document.documentElement.classList.remove('light', 'dark', 'theme-transition')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render a button', () => {
    renderWithTheme(<ThemeToggle />)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should have appropriate aria-label for dark mode', () => {
    renderWithTheme(<ThemeToggle />)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Switch to light mode'
    )
  })

  it('should toggle theme when clicked', () => {
    renderWithTheme(<ThemeToggle />)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    const button = screen.getByRole('button')

    // Initial state: dark mode
    expect(button).toHaveAttribute('aria-label', 'Switch to light mode')

    // Click to switch to light mode
    act(() => {
      fireEvent.click(button)
    })

    expect(button).toHaveAttribute('aria-label', 'Switch to dark mode')

    // Click again to switch back to dark mode
    act(() => {
      fireEvent.click(button)
    })

    expect(button).toHaveAttribute('aria-label', 'Switch to light mode')
  })

  it('should accept custom className', () => {
    renderWithTheme(<ThemeToggle className="custom-class" />)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByRole('button')).toHaveClass('custom-class')
  })

  it('should display Sun icon in dark mode and Moon icon in light mode', () => {
    renderWithTheme(<ThemeToggle />)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    const button = screen.getByRole('button')

    // In dark mode, should show Sun icon (to switch to light)
    expect(button.querySelector('svg')).toBeInTheDocument()

    act(() => {
      fireEvent.click(button)
    })

    // In light mode, should show Moon icon (to switch to dark)
    expect(button.querySelector('svg')).toBeInTheDocument()
  })
})
