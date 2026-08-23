/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Hole card — what the ground actually does                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Reads a hole from survey elevation data: how far it really is, how
 * much it falls, whether a ridge hides the pin, which way the landing
 * zone tilts.
 *
 * ── EVERYTHING HERE IS MEASURED ──────────────────────────────────────
 * Nothing on this card comes from the flight simulator. That is not a
 * limitation, it is the product: the simulator currently clears 4 of 23
 * ground-truth envelopes, while the DEM under these numbers is survey
 * data. Keeping the two apart is what lets this card be trusted at all,
 * so it carries a MEASURED badge rather than sitting anonymously beside
 * simulated output.
 *
 * ── AND NOTHING CLAIMS MORE PRECISION THAN THE DEM CARRIES ───────────
 * Mapbox terrain resolves landform (~10 m posting over the US), not
 * lies. So elevation is shown rounded to 5 ft, slopes to whole degrees,
 * and the summary sentence says "about". A card that read "drops
 * 27.4 ft" would be claiming something the data cannot support, and the
 * first player to pace it off would stop believing the rest of the app.
 *
 * The cross-slope row is omitted entirely when it was not sampled —
 * "level" and "not measured" must never look the same.
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
    Mountain, Eye, EyeOff, MoveHorizontal, TrendingDown, TrendingUp, Minus,
} from 'lucide-react';
import { FLAT_THRESHOLD_FT } from '../holes/holeTerrain';

const round5 = (v) => Math.round(v / 5) * 5;

export default function HoleCard({ hole, reading }) {
    if (!reading) return null;

    const { elevationChangeFt: elev, visibility, slopes, summary, lengthFt } = reading;
    const flat = Math.abs(elev) < FLAT_THRESHOLD_FT;
    const ElevIcon = flat ? Minus : elev > 0 ? TrendingUp : TrendingDown;

    // Downhill is the good news on a golf course and uphill is the
    // warning, so they are coloured rather than left neutral — but flat
    // stays muted, because emphasising "nothing to report" is noise.
    const elevTone = flat
        ? 'text-truarc-muted'
        : elev > 0 ? 'text-amber-300' : 'text-emerald-300';

    const pin = slopes?.at(-1) ?? null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="glass-panel p-3.5 w-[320px]"
        >
            <div className="flex items-center gap-2 mb-3">
                <Mountain size={14} className="text-truarc-accent" />
                <span className="cad-text">
                    {hole?.num ? `Hole ${hole.num} · Ground` : 'Ground'}
                </span>
                {/* The badge is load-bearing: it is how a player knows
                    which numbers in this app to trust. */}
                <span className="ml-auto text-micro font-mono px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300/90">
                    MEASURED
                </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
                <Stat
                    label="PLAYS"
                    value={`${round5(lengthFt)} ft`}
                    hint="tee to pin, over the ground"
                />
                <Stat
                    label="ELEVATION"
                    value={flat ? 'level' : `${elev > 0 ? '+' : '−'}${round5(Math.abs(elev))} ft`}
                    tone={elevTone}
                    Icon={ElevIcon}
                    hint={flat ? 'no meaningful change' : elev > 0 ? 'basket above you' : 'basket below you'}
                />
            </div>

            <p className="text-micro text-truarc-muted/80 leading-relaxed mb-3">
                {summary}
            </p>

            <div className="flex flex-col gap-1.5">
                <Row
                    Icon={visibility.blind ? EyeOff : Eye}
                    tone={visibility.blind ? 'text-amber-300' : 'text-truarc-muted'}
                    label={visibility.blind ? 'Blind from the tee' : 'Pin visible from the tee'}
                    detail={visibility.blind
                        ? `comes into view around ${round5(visibility.revealDistanceFt)} ft`
                        : null}
                />

                {pin?.crossDeg != null && Math.abs(pin.crossDeg) >= 2 && (
                    <Row
                        Icon={MoveHorizontal}
                        tone="text-truarc-muted"
                        label={`Green falls ${Math.abs(Math.round(pin.crossDeg))}° to the ${pin.crossDeg > 0 ? 'right' : 'left'}`}
                        detail="expect run-out that way"
                    />
                )}
            </div>
        </motion.div>
    );
}

function Stat({ label, value, hint, tone = 'text-truarc-text', Icon }) {
    return (
        <div className="rounded-md bg-white/[0.03] border border-white/[0.06] px-2.5 py-2">
            <span className="cad-label">{label}</span>
            <div className={`flex items-center gap-1.5 mt-0.5 ${tone}`}>
                {Icon && <Icon size={13} />}
                <span className="text-body font-mono tabular-nums leading-none">{value}</span>
            </div>
            {hint && (
                <span className="block text-micro text-truarc-muted/45 leading-tight mt-1">{hint}</span>
            )}
        </div>
    );
}

function Row({ Icon, label, detail, tone }) {
    return (
        <div className="flex items-start gap-2">
            <Icon size={13} className={`mt-0.5 shrink-0 ${tone}`} />
            <span className="min-w-0">
                <span className={`block text-micro leading-tight ${tone}`}>{label}</span>
                {detail && (
                    <span className="block text-micro text-truarc-muted/45 leading-tight">{detail}</span>
                )}
            </span>
        </div>
    );
}
