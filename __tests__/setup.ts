import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, expect } from 'vitest'
import * as matchers from 'vitest-axe/matchers'

// Extend Vitest matchers with axe accessibility matchers
expect.extend(matchers)

afterEach(() => {
  cleanup()
})
