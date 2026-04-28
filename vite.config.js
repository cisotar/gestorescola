import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
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
    globals: true,
    include: ['src/__tests__/**/*.test.js'],
    // Os testes de Firestore Security Rules compartilham o mesmo emulador
    // (mesmo projectId e porta). Rodar em sequência evita que o clearFirestore()
    // de uma suite interfira nos dados de outra suite rodando em paralelo.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/lib/absences.js'],
    },
  },
})
