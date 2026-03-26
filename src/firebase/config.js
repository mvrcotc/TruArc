/**
 * Firebase — same project as Earth & Co: add a Web app in Console, copy config into .env (see .env.example).
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const ENV_KEYS = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
];

export function isFirebaseConfigured() {
    return ENV_KEYS.every((k) => String(import.meta.env[k] || '').trim());
}

function firebaseOptions() {
    return {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
}

export function getFirebaseApp() {
    if (!isFirebaseConfigured()) return null;
    if (!getApps().length) initializeApp(firebaseOptions());
    return getApp();
}

export function getFirebaseAuth() {
    const app = getFirebaseApp();
    return app ? getAuth(app) : null;
}

export function getFirebaseDb() {
    const app = getFirebaseApp();
    return app ? getFirestore(app) : null;
}
