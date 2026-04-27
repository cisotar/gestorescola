// src/store/useSchoolStore.js
import { create } from 'zustand'
import { doc, getDoc, collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getSchoolRef } from '../lib/firebase/multi-tenant'
import { teardownListeners } from '../lib/db'

const LS_KEY = 'gestao_active_school'

const INITIAL_STATE = {
  currentSchoolId:    null,   // string | null
  currentSchool:      null,   // objeto do doc schools/{id} | null
  availableSchools:   [],     // [{ schoolId, ...schoolDoc.data() }]
  allSchools:         [],     // [{ schoolId, ...schoolDoc.data() }] — apenas para SaaS admin
  _unsubAllSchools:   null,   // unsubscribe do onSnapshot global de schools
}

const useSchoolStore = create((set, get) => ({
  ...INITIAL_STATE,

  // ─── setCurrentSchool ─────────────────────────────────────────────────────
  // Lê o documento da escola no Firestore, atualiza o store e persiste no LS.
  // Não cancela listeners — use switchSchool() para trocas em runtime.
  setCurrentSchool: async (schoolId) => {
    try {
      const snap = await getDoc(getSchoolRef(schoolId))
      if (!snap.exists()) {
        console.warn('[useSchoolStore] Escola não encontrada:', schoolId)
        return
      }
      const currentSchool = { schoolId, ...snap.data() }
      set({ currentSchoolId: schoolId, currentSchool })
      try { localStorage.setItem(LS_KEY, schoolId) } catch {}
    } catch (e) {
      console.error('[useSchoolStore] setCurrentSchool falhou:', e)
      throw e
    }
  },

  // ─── switchSchool ─────────────────────────────────────────────────────────
  // Cancela todos os listeners da escola anterior, limpa o appStore e ativa a nova escola.
  // Chamar este método — nunca setCurrentSchool diretamente — ao trocar escola em runtime.
  switchSchool: async (schoolId) => {
    // 1. Cancelar listeners Firestore da escola anterior
    teardownListeners()

    // 2. Limpar listeners lazy (absences, history) do appStore
    const { default: useAppStore } = await import('./useAppStore')
    const appStore = useAppStore.getState()
    appStore.cleanupLazyListeners()

    // 3. Resetar dados do appStore para evitar leituras cruzadas entre escolas
    appStore.hydrate({
      segments: [], periodConfigs: {}, areas: [], subjects: [],
      sharedSeries: [], teachers: [], schedules: [], absences: [], history: [],
      workloadWarn: 20, workloadDanger: 26,
      loaded: false, teachersLoaded: false, schedulesLoaded: false,
      absencesLoaded: false, historyLoaded: false,
    })

    // 4. Ativar a nova escola
    await get().setCurrentSchool(schoolId)
  },

  // ─── loadAvailableSchools ─────────────────────────────────────────────────
  // Lê users/{uid}.schools e faz getDoc para cada escola, montando availableSchools.
  loadAvailableSchools: async (uid) => {
    try {
      const userSnap = await getDoc(doc(db, 'users', uid))
      if (!userSnap.exists()) {
        console.warn('[useSchoolStore] Documento users/' + uid + ' não encontrado')
        return
      }
      const schoolsMap = userSnap.data().schools ?? {}
      // Suporta tanto boolean map ({ [schoolId]: true }) quanto object map ({ [schoolId]: { role: '...' } })
      const schoolIds = Object.keys(schoolsMap).filter(k =>
        schoolsMap[k] === true || (typeof schoolsMap[k] === 'object' && schoolsMap[k] !== null)
      )
      if (schoolIds.length === 0) return

      const snaps = await Promise.all(schoolIds.map(id => getDoc(getSchoolRef(id))))
      const availableSchools = snaps
        .filter(s => s.exists())
        .map(s => ({ schoolId: s.id, ...s.data() }))

      set({ availableSchools })
    } catch (e) {
      console.warn('[useSchoolStore] loadAvailableSchools falhou:', e)
    }
  },

  // ─── fetchAllSchools ─────────────────────────────────────────────────────
  // Subscribe global em /schools (apenas SaaS admin). Reflete suspensões e
  // criações em tempo real. Ordena por createdAt desc; filtra deletedAt!=null
  // client-side (Firestore não indexa nulls em where '==' de forma confiável,
  // e o volume esperado é baixo). Escolas legadas sem createdAt serão
  // omitidas pelo orderBy — comportamento aceito (migração separada).
  fetchAllSchools: () => {
    // Cancela subscription anterior (idempotência)
    get()._unsubAllSchools?.()
    const q = query(collection(db, 'schools'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      snap => {
        const allSchools = snap.docs
          .map(d => ({ schoolId: d.id, ...d.data() }))
          .filter(s => s.deletedAt == null)
        set({ allSchools })
      },
      err => console.warn('[allSchools]', err)
    )
    set({ _unsubAllSchools: unsub })
    return unsub
  },

  // ─── stopAllSchoolsListener ──────────────────────────────────────────────
  // Cancela o listener global e limpa allSchools. Chamado no logout.
  stopAllSchoolsListener: () => {
    get()._unsubAllSchools?.()
    set({ _unsubAllSchools: null, allSchools: [] })
  },

  // ─── init ─────────────────────────────────────────────────────────────────
  // Chamado no boot após login. Restaura escola do LS se uid ainda for membro.
  init: async (uid) => {
    await get().loadAvailableSchools(uid)

    let savedId = null
    try { savedId = localStorage.getItem(LS_KEY) } catch {}

    const { availableSchools } = get()

    // Caso pendente: tem savedId mas availableSchools vazio (users/{uid} inexistente
    // ou ainda sem escolas vinculadas). Valida schools/{savedId} e mantém o contexto
    // sem exigir membership — preserva RN-2 em reload de PendingPage.
    if (savedId && availableSchools.length === 0) {
      try {
        const snap = await getDoc(getSchoolRef(savedId))
        if (snap.exists()) {
          await get().setCurrentSchool(savedId)
          return
        }
        try { localStorage.removeItem(LS_KEY) } catch {}
        return
      } catch (e) {
        console.warn('[useSchoolStore] init: validacao schools/{id} falhou', e)
        return
      }
    }

    // Se não tem escola salva mas só tem uma disponível, seleciona automaticamente
    if (!savedId) {
      if (availableSchools.length === 1) {
        await get().setCurrentSchool(availableSchools[0].schoolId)
      }
      return
    }

    const isMember = availableSchools.some(s => s.schoolId === savedId)

    if (!isMember) {
      try { localStorage.removeItem(LS_KEY) } catch {}
      // Tenta selecionar a primeira disponível
      if (availableSchools.length === 1) {
        await get().setCurrentSchool(availableSchools[0].schoolId)
      }
      return
    }

    await get().setCurrentSchool(savedId)
  },
}))

export default useSchoolStore
