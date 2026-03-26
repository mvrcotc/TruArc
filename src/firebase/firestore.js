/**
 * Firestore helpers — use the same Firebase project as your other apps.
 * Set security rules so users can only read/write their own docs under `users/{uid}/...`.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from './config';

/** @param {string} uid */
export async function getUserProfile(uid) {
    const db = getFirebaseDb();
    if (!db || !uid) return null;
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
}

/**
 * @param {string} uid
 * @param {Record<string, unknown>} data
 */
export async function mergeUserProfile(uid, data) {
    const db = getFirebaseDb();
    if (!db || !uid) return;
    await setDoc(
        doc(db, 'users', uid),
        { ...data, updatedAt: serverTimestamp() },
        { merge: true }
    );
}
