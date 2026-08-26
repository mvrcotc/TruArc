/**
 * Firestore helpers for in-app course-editor drafts (Section 5).
 *
 * Stored under `users/{uid}/courseEdits/{courseId}_{holeNum}` — the SAME
 * "users can only read/write their own docs under users/{uid}/..."
 * security model firestore.js already documents, rather than a new
 * globally-writable collection whose security rules this session has no
 * way to write or test against a real project. This means an edit saved
 * here is a personal DRAFT, not automatically merged into the shared
 * COURSE_DATABASE — turning drafts into the app's canonical course data
 * (moderation, conflict resolution across contributors) is real,
 * un-built work for a future session, not something this module claims
 * to solve.
 *
 * UNVERIFIED LIVE: this environment has no Firebase project configured
 * (getFirebaseDb() returns null — see config.js), so these calls have
 * never actually round-tripped through a real Firestore. Same category
 * of gap as every other network-touching module in this codebase
 * (acquire.py's USGS call, import-osm.mjs's Overpass call).
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from './config';

function editDocId(courseId, holeNum) {
    return `${courseId}_${holeNum}`;
}

/**
 * @param {string} uid
 * @param {string} courseId
 * @param {number} holeNum
 * @returns {Promise<object|null>} the saved edit (importHoleEdit-shaped
 *   JSON), or null if the user has no draft for this hole (or Firestore
 *   isn't configured).
 */
export async function getCourseEdit(uid, courseId, holeNum) {
    const db = getFirebaseDb();
    if (!db || !uid || !courseId) return null;
    const snap = await getDoc(doc(db, 'users', uid, 'courseEdits', editDocId(courseId, holeNum)));
    return snap.exists() ? snap.data() : null;
}

/**
 * @param {string} uid
 * @param {object} editData - courseEditExport.js's `exportHoleEdit()` output.
 */
export async function saveCourseEdit(uid, editData) {
    const db = getFirebaseDb();
    if (!db || !uid || !editData?.courseId) return;
    await setDoc(
        doc(db, 'users', uid, 'courseEdits', editDocId(editData.courseId, editData.holeNum)),
        { ...editData, updatedAt: serverTimestamp() },
        { merge: false }, // a full replace, not a field-merge — an edit is one coherent snapshot, not accumulating fields from a stale prior save
    );
}
