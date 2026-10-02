// Punto de entrada para empaquetar solo las partes de Firebase que usa la app (npm run build:firebase)
export { initializeApp } from 'firebase/app';
export { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
export { initializeFirestore, persistentLocalCache, persistentSingleTabManager, collection, doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
