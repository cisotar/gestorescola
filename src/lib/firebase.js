import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            'AIzaSyDN7ivev6Dgse8uZOi_2j6KqyAngVvuM7o',
  authDomain:        'gestordesubstituicoes.firebaseapp.com',
  projectId:         'gestordesubstituicoes',
  storageBucket:     'gestordesubstituicoes.firebasestorage.app',
  messagingSenderId: '51263219079',
  appId:             '1:51263219079:web:ac4781dbefcd6d94d5df22',
}

export const app      = initializeApp(firebaseConfig)
export const db       = getFirestore(app)
export const auth     = getAuth(app)
export const provider = new GoogleAuthProvider()
