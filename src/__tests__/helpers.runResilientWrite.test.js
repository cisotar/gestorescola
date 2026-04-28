// src/__tests__/helpers.runResilientWrite.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks de módulo ──────────────────────────────────────────────────────────

// Objeto mutável compartilhado com a factory do vi.mock via closure.
// Usamos objeto (não primitiva) porque vi.mock factories são hoisted antes
// das declarações let/const — o objeto é criado na zona temporal morta,
// mas a leitura de networkState.online ocorre somente em runtime (na chamada
// real de getState()), quando o objeto já existe e foi populado.
const networkState = { online: true }

// Paths relativos ao arquivo de teste (src/__tests__/), não ao módulo fonte.
vi.mock('../store/useNetworkStore', () => ({
  default: {
    getState: () => ({ online: networkState.online }),
  },
}))

// Mock de withTimeout — substituído por implementação controlável por cenário.
// A variável `mockWithTimeout` é reatribuída em cada teste que precise de
// comportamento específico. O módulo exporta um named export `withTimeout`.
let mockWithTimeout = vi.fn()

vi.mock('../lib/helpers/withTimeout', () => ({
  withTimeout: (...args) => mockWithTimeout(...args),
}))

// mapFirestoreError é função pura — importada real, sem mock.

// ─── Import pós-mock ──────────────────────────────────────────────────────────
import { runResilientWrite } from '../lib/helpers/runResilientWrite'

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  networkState.online = true
  // Comportamento padrão: passa a promise adiante (simula sucesso imediato).
  mockWithTimeout.mockImplementation((promise) => promise)
})

// ─── Cenário offline ─────────────────────────────────────────────────────────

describe('runResilientWrite — offline', () => {
  it('retorna { ok: false, code: "offline" } quando useNetworkStore.online é false', async () => {
    networkState.online = false
    const operationFn = vi.fn()
    const result = await runResilientWrite(operationFn)
    expect(result).toMatchObject({ ok: false, code: 'offline' })
    expect(typeof result.message).toBe('string')
    expect(result.message.length).toBeGreaterThan(0)
  })

  it('não invoca operation quando offline', async () => {
    networkState.online = false
    const operationFn = vi.fn()
    await runResilientWrite(operationFn)
    expect(operationFn).not.toHaveBeenCalled()
  })

  it('retorna imediatamente sem chamar withTimeout quando offline', async () => {
    networkState.online = false
    const operationFn = vi.fn()
    await runResilientWrite(operationFn)
    expect(mockWithTimeout).not.toHaveBeenCalled()
  })
})

// ─── Cenário online — sucesso ─────────────────────────────────────────────────

describe('runResilientWrite — online, sucesso', () => {
  it('retorna { ok: true, data } com valor resolvido pela operation', async () => {
    const operationFn = vi.fn(() => Promise.resolve({ id: 'doc-123' }))
    mockWithTimeout.mockImplementation((promise) => promise)
    const result = await runResilientWrite(operationFn)
    expect(result).toEqual({ ok: true, data: { id: 'doc-123' } })
  })

  it('data é undefined quando operation resolve void', async () => {
    const operationFn = vi.fn(() => Promise.resolve())
    mockWithTimeout.mockImplementation((promise) => promise)
    const result = await runResilientWrite(operationFn)
    expect(result).toEqual({ ok: true, data: undefined })
  })

  it('invoca withTimeout com a promise retornada por operation()', async () => {
    const operationPromise = Promise.resolve('valor')
    const operationFn = vi.fn(() => operationPromise)
    mockWithTimeout.mockImplementation((promise) => promise)
    await runResilientWrite(operationFn)
    // Primeiro argumento de withTimeout deve ser a promise originada por operation()
    expect(mockWithTimeout).toHaveBeenCalledOnce()
    expect(mockWithTimeout.mock.calls[0][0]).toBe(operationPromise)
  })
})

// ─── options.timeoutMs e options.timeoutMessage ───────────────────────────────

describe('runResilientWrite — options de timeout', () => {
  it('passa timeoutMs customizado para withTimeout', async () => {
    const operationFn = vi.fn(() => Promise.resolve())
    mockWithTimeout.mockImplementation((promise) => promise)
    const CUSTOM_MS = 5000
    await runResilientWrite(operationFn, { timeoutMs: CUSTOM_MS })
    expect(mockWithTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      CUSTOM_MS,
      undefined,
    )
  })

  it('usa timeout default (15000) quando timeoutMs não é informado', async () => {
    const operationFn = vi.fn(() => Promise.resolve())
    mockWithTimeout.mockImplementation((promise) => promise)
    await runResilientWrite(operationFn)
    expect(mockWithTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      15000,
      undefined,
    )
  })

  it('passa timeoutMessage para withTimeout quando fornecida', async () => {
    const operationFn = vi.fn(() => Promise.resolve())
    mockWithTimeout.mockImplementation((promise) => promise)
    const MSG = 'Salvamento demorou demais'
    await runResilientWrite(operationFn, { timeoutMs: 8000, timeoutMessage: MSG })
    expect(mockWithTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      8000,
      MSG,
    )
  })
})

// ─── Cenário online — timeout ─────────────────────────────────────────────────

describe('runResilientWrite — timeout', () => {
  it('retorna { ok: false, code: "timeout" } quando withTimeout rejeita com { code: "timeout" }', async () => {
    const operationFn = vi.fn(() => new Promise(() => {})) // nunca resolve
    mockWithTimeout.mockRejectedValue({ code: 'timeout', message: 'A operação demorou demais. Tente novamente.' })
    const result = await runResilientWrite(operationFn)
    expect(result).toMatchObject({ ok: false, code: 'timeout' })
    expect(typeof result.message).toBe('string')
  })
})

// ─── Cenário online — erros Firestore ────────────────────────────────────────

describe('runResilientWrite — erros Firestore', () => {
  it('retorna { ok: false, code: "permission-denied" } para erro com code "permission-denied"', async () => {
    const operationFn = vi.fn(() => Promise.reject({ code: 'permission-denied' }))
    mockWithTimeout.mockImplementation((promise) => promise)
    const result = await runResilientWrite(operationFn)
    expect(result).toMatchObject({ ok: false, code: 'permission-denied' })
    expect(result.message).toBe('Sem permissão para executar esta operação.')
  })

  it('retorna { ok: false, code: "unavailable" } para erro de rede (code "unavailable")', async () => {
    const operationFn = vi.fn(() => Promise.reject({ code: 'unavailable' }))
    mockWithTimeout.mockImplementation((promise) => promise)
    const result = await runResilientWrite(operationFn)
    expect(result).toMatchObject({ ok: false, code: 'unavailable' })
    expect(result.message).toBe('Conexão instável. Verifique sua internet e tente novamente.')
  })

  it('retorna { ok: false, code: "unavailable" } para erro com message contendo "network"', async () => {
    const operationFn = vi.fn(() => Promise.reject(new Error('network request failed')))
    mockWithTimeout.mockImplementation((promise) => promise)
    const result = await runResilientWrite(operationFn)
    expect(result).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('retorna { ok: false, code: "unknown" } para erro sem code reconhecido', async () => {
    const operationFn = vi.fn(() => Promise.reject(new Error('algo inesperado aconteceu')))
    mockWithTimeout.mockImplementation((promise) => promise)
    const result = await runResilientWrite(operationFn)
    expect(result).toMatchObject({ ok: false, code: 'unknown' })
    expect(result.message).toBe('Não foi possível concluir a operação. Tente novamente.')
  })
})

// ─── Garantia de não-lançamento ───────────────────────────────────────────────

describe('runResilientWrite — garantia de não-lançamento', () => {
  it('nunca propaga exceção — resolves mesmo quando operation lança synchronously', async () => {
    const operationFn = vi.fn(() => { throw new Error('erro síncrono inesperado') })
    // withTimeout recebe uma promise já rejeitada (Error síncrono em operation()
    // transforma-se em rejeição de Promise.race via o wrapped)
    mockWithTimeout.mockImplementation((promise) => promise)
    const promise = runResilientWrite(operationFn)
    await expect(promise).resolves.toMatchObject({ ok: false })
  })

  it('nunca propaga exceção — resolves mesmo quando operation retorna promise rejeitada', async () => {
    const operationFn = vi.fn(() => Promise.reject(new Error('falha grave')))
    mockWithTimeout.mockImplementation((promise) => promise)
    const promise = runResilientWrite(operationFn)
    await expect(promise).resolves.toMatchObject({ ok: false })
  })

  it('nunca propaga exceção — resolves mesmo quando withTimeout rejeita com objeto sem code', async () => {
    const operationFn = vi.fn(() => Promise.resolve())
    mockWithTimeout.mockRejectedValue({ message: 'algum erro obscuro' })
    const promise = runResilientWrite(operationFn)
    await expect(promise).resolves.toMatchObject({ ok: false })
  })

  it('nunca propaga exceção — resolves mesmo quando withTimeout rejeita com null', async () => {
    const operationFn = vi.fn(() => Promise.resolve())
    mockWithTimeout.mockRejectedValue(null)
    const promise = runResilientWrite(operationFn)
    await expect(promise).resolves.toMatchObject({ ok: false })
  })
})
