import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/absences.js'],
    },
  },
})
