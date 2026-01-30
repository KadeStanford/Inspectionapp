// 🧠 Cursor: Firebase service with proper imports now that firebase package is installed
// Previous fallback implementations replaced with real Firebase imports

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

// ------------------------------------------------------------------
// 🔑 FIREBASE CONFIGURATION
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAz0-E7LMtIDMpMI4l_QGOSLltNu7XQqAg",
  authDomain: "inspectionapp-3091a.firebaseapp.com",
  projectId: "inspectionapp-3091a",
  storageBucket: "inspectionapp-3091a.firebasestorage.app",
  messagingSenderId: "43595428884",
  appId: "1:43595428884:web:e73ecc0053c65519c7a301",
  measurementId: "G-L50EQ3PFRB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Export for compatibility
export { app };



// Fallback implementations for when Firebase is not available
export const mockAuth = {
  currentUser: null,
  signInWithEmailAndPassword: () => Promise.reject(new Error('Firebase not configured')),
  signOut: () => Promise.resolve(),
  onAuthStateChanged: () => () => {}
};

export const mockDb = {
  collection: () => ({
    doc: () => ({
      set: () => Promise.resolve(),
      get: () => Promise.resolve({ exists: () => false, data: () => null }),
      update: () => Promise.resolve(),
      delete: () => Promise.resolve()
    }),
    add: () => Promise.resolve({ id: 'mock-id' }),
    where: () => ({
      get: () => Promise.resolve({ empty: true, docs: [] })
    })
  })
};

export const mockStorage = {
  ref: () => ({
    child: () => ({
      put: () => Promise.resolve({ ref: { getDownloadURL: () => Promise.resolve('mock-url') } }),
      getDownloadURL: () => Promise.resolve('mock-url'),
      delete: () => Promise.resolve()
    })
  })
};

// Use real Firebase if available, otherwise use mocks
export default {
  auth: auth || mockAuth,
  db: db || mockDb,
  storage: storage || mockStorage
}; 