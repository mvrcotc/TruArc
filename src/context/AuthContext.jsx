import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const configured = isFirebaseConfigured();
    const [loading, setLoading] = useState(configured);

    useEffect(() => {
        if (!configured) {
            setLoading(false);
            return undefined;
        }
        const auth = getFirebaseAuth();
        if (!auth) {
            setLoading(false);
            return undefined;
        }
        return onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
        });
    }, [configured]);

    const value = useMemo(
        () => ({
            configured,
            user,
            loading,
            async signInWithGoogle() {
                const auth = getFirebaseAuth();
                if (!auth) return;
                const provider = new GoogleAuthProvider();
                await signInWithPopup(auth, provider);
            },
            async signOutUser() {
                const auth = getFirebaseAuth();
                if (!auth) return;
                await signOut(auth);
            },
        }),
        [configured, user, loading]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
