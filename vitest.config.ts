import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['__tests__/e2e/**', 'node_modules/**'],
    // happy-dom >= 20.8.9 (required to clear its security advisory) rejects
    // Animation.finished with an AbortError when framer-motion cancels an
    // animation on unmount. Only that specific test-env rejection is ignored.
    onUnhandledError(error) {
      if (error.name === 'AbortError' && error.message === 'The animation was canceled.') {
        return false
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '__tests__/**',
        '**/*.config.*',
        '.next/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
