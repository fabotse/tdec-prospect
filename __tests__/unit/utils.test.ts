import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn utility function', () => {
  it('should merge class names correctly', () => {
    const result = cn('px-4', 'py-2')
    expect(result).toBe('px-4 py-2')
  })

  it('should handle conditional classes', () => {
    const isActive = true
    const result = cn('btn', isActive && 'btn-active')
    expect(result).toBe('btn btn-active')
  })

  it('should handle false conditional classes', () => {
    const isActive = false
    const result = cn('btn', isActive && 'btn-active')
    expect(result).toBe('btn')
  })

  it('should merge conflicting Tailwind classes', () => {
    const result = cn('px-4', 'px-6')
    expect(result).toBe('px-6')
  })

  it('should handle arrays of classes', () => {
    const result = cn(['px-4', 'py-2'], 'text-lg')
    expect(result).toBe('px-4 py-2 text-lg')
  })

  it('should handle empty inputs', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('should handle undefined and null values', () => {
    const result = cn('px-4', undefined, null, 'py-2')
    expect(result).toBe('px-4 py-2')
  })
})
