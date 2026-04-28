// src/store/useSchoolStore.js
import { create } from 'zustand'
import { doc, getDoc, collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getSchoolRef } from '../lib/firebase/multi-tenant'
import { teardownListeners } from '../lib/db'
import { bootSequence } from '../lib/boot'

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
  // Não aguarda carga de dados — App.jsx detecta a mudança de currentSchoolId e dispara
  // loadData() via useEffect, que chama hydrate(data) ao terminar (loaded → true).
  // Enquanto isso, o spinner de App.jsx fica visível porque loaded === false.
  //
  // Caso especial: se a escola clicada já é a ativa (ex: SaaS admin clica no card
  // de uma escola que estava restaurada do localStorage), pula o reset/reload —
  // os dados já foram carregados pelo boot. Apenas garante que loaded === true.
  //
  // Chamar este método — nunca setCurrentSchool diretamente — ao trocar escola em runtime.
  switchSchool: async (schoolId) => {
    const currentId = get().currentSchoolId
    const { default: useAppStore } = await import('./useAppStore')
    const appStore = useAppStore.getState()

    // Mesma escola já ativa: não reseta nem recarrega — apenas garante loaded:true
    // para o caso de o store ter sido limpo por algum efeito intermediário.
    if (currentId === schoolId) {
      if (!appStore.loaded) {
        // Se por algum motivo loaded ficou false, recarrega os dados.
        const { loadFromFirestore, setupRealtimeListeners, teardownListeners: _td } = await import('../lib/db')
        _td()
        const data = await loadFromFirestore(schoolId)
        appStore.hydrate(data ?? {})
        setupRealtimeListeners(schoolId, useAppStore.getState())
      }
      return
    }

    // 1. Cancelar listeners Firestore da escola anterior
    teardownListeners()

    // 2. Limpar listeners lazy (absences, history) do appStore
    appStore.cleanupLazyListeners()

    // 3. Resetar dados do appStore para evitar leituras cruzadas entre escolas
    appStore.hydrate({
      segments: [], periodConfigs: {}, areas: [], subjects: [],
      sharedSeries: [], teachers: [], schedules: [], absences: [], history: [],
      workloadWarn: 20, workloadDanger: 26,
      loaded: false, teachersLoaded: false, schedulesLoaded: false,
      absencesLoaded: false, historyLoaded: false,
    })

    // 4. Ativar a nova escola (dispara effect em App.jsx que chama loadData())
    await get().setCurrentSchool(schoolId)
  },

  // ─── loadAvailableSchools ─────────────────────────────────────────────────
  // Lê users/{uid}.schools e faz getDoc para cada escola, montando availableSchools.
  // Retorna o userSnap para que o caller possa reutilizá-lo em _resolveRole,
  // evitando uma segunda leitura de users/{uid}.
  loadAvailableSchools: async (uid) => {
    try {
      const userSnap = await getDoc(doc(db, 'users', uid))
      if (!userSnap.exists()) {
        console.warn('[useSchoolStore] Documento users/' + uid + ' não encontrado')
        return userSnap
      }
      const schoolsMap = userSnap.data().schools ?? {}
      // Suporta tanto boolean map ({ [schoolId]: true }) quanto object map ({ [schoolId]: { role: '...' } })
      const schoolIds = Object.keys(schoolsMap).filter(k =>
        schoolsMap[k] === true || (typeof schoolsMap[k] === 'object' && schoolsMap[k] !== null)
      )
      if (schoolIds.length > 0) {
        const snaps = await Promise.all(schoolIds.map(id => getDoc(getSchoolRef(id))))
        const availableSchools = snaps
          .filter(s => s.exists())
          .map(s => ({ schoolId: s.id, ...s.data() }))
        set({ availableSchools })
      }
      return userSnap
    } catch (e) {
      console.warn('[useSchoolStore] loadAvailableSchools falhou:', e)
      return null
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
  // Retorna o userSnap obtido em loadAvailableSchools para que o caller
  // (_resolveRole) possa reutilizá-lo sem nova leitura ao Firestore.
  // isSaasAdmin: quando true, descarta o savedId do LS sem validar schools/{id}
  // — saas admin sem membership não deve restaurar escola do boot (evita re-resolves
  // em cascata causados por setState no SchoolStore dentro de _resolveRole).
  init: async (uid, isSaasAdmin = false) => {
    const userSnap = await get().loadAvailableSchools(uid)

    let savedId = null
    try { savedId = localStorage.getItem(LS_KEY) } catch {}

    const { availableSchools } = get()

    // bootSequence decide qual schoolId restaurar e se o LS deve ser limpo.
    // Passamos um objeto mínimo com uid (user.email não é usado aqui pois
    // isSaasAdmin já encapsula a verificação feita externamente via SUPER_USERS).
    const result = bootSequence({ uid }, userSnap, availableSchools, savedId, isSaasAdmin)

    // Aplicar clearLocalStorage antes de qualquer setCurrentSchool
    if (result.clearLocalStorage) {
      try { localStorage.removeItem(LS_KEY) } catch {}
    }

    if (result.schoolId !== null) {
      // Caso pendente: savedId retornado mas availableSchools está vazio — usuário
      // sem membership ainda. Valida o doc da escola antes de ativar (I/O de setup,
      // não lógica de decisão — permanece aqui pois bootSequence é pura/sem I/O).
      if (availableSchools.length === 0 && result.schoolId === savedId) {
        try {
          const snap = await getDoc(getSchoolRef(result.schoolId))
          if (snap.exists()) {
            await get().setCurrentSchool(result.schoolId)
          } else {
            try { localStorage.removeItem(LS_KEY) } catch {}
          }
        } catch (e) {
          console.warn('[useSchoolStore] init: validacao schools/{id} falhou', e)
        }
      } else {
        await get().setCurrentSchool(result.schoolId)
      }
    }

    return userSnap
  },
}))

export default useSchoolStore
