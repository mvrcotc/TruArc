/**
 * Sign in with Google when Firebase env vars are set; hidden otherwise.
 */
import React from 'react';
import { LogIn, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function FirebaseAuthBar() {
    const { configured, user, loading, signInWithGoogle, signOutUser } = useAuth();

    if (!configured) return null;

    if (loading) {
        return <Loader2 className="animate-spin text-truarc-muted" size={14} aria-label="Loading auth" />;
    }

    if (user) {
        return (
            <div className="flex items-center gap-2 border-l border-truarc-border/40 pl-3 ml-1">
                <span
                    className="max-w-[100px] sm:max-w-[140px] truncate text-[10px] sm:text-xs text-truarc-muted hidden sm:inline"
                    title={user.email || user.uid}
                >
                    {user.email || user.uid}
                </span>
                <button
                    type="button"
                    onClick={() => signOutUser()}
                    className="btn-ghost flex items-center gap-1 px-2 py-1 rounded-md text-truarc-muted hover:text-truarc-text"
                    title="Sign out"
                >
                    <LogOut size={13} />
                </button>
            </div>
        );
    }

    return (
        <div className="border-l border-truarc-border/40 pl-3 ml-1">
            <button
                type="button"
                onClick={() => signInWithGoogle()}
                className="btn-ghost flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-truarc-muted hover:text-truarc-accent"
            >
                <LogIn size={13} />
                <span className="hidden sm:inline">Sign in</span>
            </button>
        </div>
    );
}
