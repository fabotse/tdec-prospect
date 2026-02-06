import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '@/components/common/ThemeProvider'

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

// Test component that uses the useTheme hook
function TestComponent() {
  const { theme, toggleTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button data-testid="toggle-btn" onClick={toggleTheme}>
        Toggle
      </button>
      <button data-testid="set-light-btn" onClick={() => setTheme('light')}>
        Set Light
      </button>
      <button data-testid="set-dark-btn" onClick={() => setTheme('dark')}>
        Set Dark
      </button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorageMock.clear()
    document.documentElement.classList.remove('light', 'dark', 'theme-transition')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render children', () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Child Content</div>
      </ThemeProvider>
    )

    // Wait for mount
    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('should default to dark theme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
  })

  it('should toggle theme from dark to light', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')

    act(() => {
      fireEvent.click(screen.getByTestId('toggle-btn'))
    })

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('should persist theme to localStorage', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    act(() => {
      vi.advanceTimersByTime(0)
    })

    act(() => {
      fireEvent.click(screen.getByTestId('set-light-btn'))
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'light')
  })

  it('should load theme from localStorage', () => {
    localStorageMock.getItem.mockReturnValue('light')

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
  })

  it('should add transition class during theme change', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    act(() => {
      vi.advanceTimersByTime(0)
    })

    act(() => {
      fireEvent.click(screen.getByTestId('toggle-btn'))
    })

    expect(document.documentElement.classList.contains('theme-transition')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(document.documentElement.classList.contains('theme-transition')).toBe(false)
  })

  it('should throw error when useTheme is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useTheme must be used within a ThemeProvider')

    consoleSpy.mockRestore()
  })

  it('should set theme directly via setTheme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    act(() => {
      vi.advanceTimersByTime(0)
    })

    act(() => {
      fireEvent.click(screen.getByTestId('set-light-btn'))
    })

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')

    act(() => {
      fireEvent.click(screen.getByTestId('set-dark-btn'))
    })

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
  })
})
