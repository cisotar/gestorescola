import { initializeApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app       = initializeApp(firebaseConfig)
export const db        = getFirestore(app)
export const auth      = getAuth(app)
export const provider  = new GoogleAuthProvider()
export const functions = getFunctions(app, 'southamerica-east1')

// Conectar aos emulators quando flag estiver ativa.
// Vite avalia `import.meta.env` em build-time; quando a flag não está setada
// no build de produção, este bloco é tree-shaked e nenhuma referência a
// `connect*Emulator` aparece no bundle final.
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || 'localhost'
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  connectFunctionsEmulator(functions, host, 5001)
  // eslint-disable-next-line no-console
  console.info('[firebase] Connected to emulator suite at', host)
}
