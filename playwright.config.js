import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente de .env.test
dotenv.config({ path: '.env.test' });

/**
 * Configuração do Playwright para testes E2E
 *
 * - Sobe Vite em modo `test` (carrega .env.test => VITE_USE_FIREBASE_EMULATOR=true)
 * - globalSetup: sobe Firebase Emulators (auth/firestore/functions), roda seed,
 *   gera custom tokens
 * - globalTeardown: mata emulator, limpa tokens
 * - Apenas chromium por enquanto (firefox/webkit em follow-up)
 * - Reuso de emulator entre runs: setar E2E_REUSE_EMULATOR=true
 */

export default defineConfig({
  testDir: './e2e/tests',

  // Hooks globais (sobem/descem o emulator).
  globalSetup: './e2e/global-setup.js',
  globalTeardown: './e2e/global-teardown.js',

  // Serial execution (evita race conditions em testes que compartilham estado)
  fullyParallel: false,

  // Timeout por teste
  timeout: process.env.TIMEOUT ? parseInt(process.env.TIMEOUT) : 30 * 1000,

  // Timeout global por assertion
  expect: {
    timeout: 5 * 1000,
  },

  // Retries: 2 em CI, 0 em desenvolvimento
  retries: process.env.CI ? 2 : 0,

  // Parallel workers: apenas 1 em dev/CI para evitar conflitos com seed compartilhado
  workers: 1,

  // Reporters: HTML (para visualizar falhas) + JSON (para CI/parsing)
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['list'],
  ],

  // Configuração do webServer (inicia Vite automaticamente em modo test)
  webServer: {
    command: 'npm run dev -- --mode test',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      VITE_USE_FIREBASE_EMULATOR: 'true',
    },
  },

  // Configuração de navegadores
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
  },

  // Apenas chromium (firefox/webkit fora do escopo da issue 098)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-results',
});
