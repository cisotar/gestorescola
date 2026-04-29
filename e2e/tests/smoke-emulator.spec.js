import { test, expect } from '@playwright/test'
import { loginAs, isLoggedIn } from '../helpers/auth-helpers.js'
import fixtures from '../fixtures/usuarios-teste.json' with { type: 'json' }
const usuarios = fixtures.usuarios

test.describe('smoke: emulator + auth integration', () => {
  test('app conecta ao emulator e expõe __e2eFirebase', async ({ page }) => {
    await page.goto('/')
    const exposed = await page
      .waitForFunction(() => Boolean(window.__e2eFirebase), null, { timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    expect(exposed).toBe(true)
  })

  test('admin loga via custom token e cai em /dashboard', async ({ page }) => {
    const admin = usuarios.find((u) => u.role === 'admin')
    expect(admin, 'fixture deve ter usuário admin').toBeTruthy()
    await loginAs(page, admin.email)
    expect(await isLoggedIn(page)).toBe(true)
    expect(page.url()).toMatch(/\/(dashboard|home)/)
  })
})
