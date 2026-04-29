import { test, expect } from '@playwright/test';

test('Playwright está configurado corretamente', async ({ page }) => {
  // Navega para a página inicial da aplicação
  await page.goto('/');

  // Valida que a URL contém localhost:5173 (dev server rodando)
  const url = page.url();
  expect(url).toContain('localhost:5173');

  // Validação básica: a página deve carregar sem erro
  expect(page).toBeDefined();
});
