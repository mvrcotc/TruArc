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
 *
 * ── THE PIN HAS TO BE REAL, OR NONE OF IT IS ─────────────────────────
 * The profile is sampled along the line from tee to basket, so the
 * reading is only as good as the basket's position. 288 of this app's
 * 306 holes carry `dataQuality: 'estimated'` — their baskets are
 * DERIVED from tee + bearing + listed distance, and a 10° bearing error
 * on a 400 ft hole puts the pin ~70 ft off. Sample a line 70 ft wide of
 * the fairway and you can miss the ridge entirely.
 *
 * So an estimated hole gets no reading at all. Not a hedged one, not a
 * greyed-out one: the numbers would be confidently wrong, which is the
 * one failure this card exists to avoid. What it shows instead is why,
 * because a blank space reads as a bug and the honest explanation is
 * also the pitch for placing the pin yourself.
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
    Mountain, Eye, EyeOff, MoveHorizontal, TrendingDown, TrendingUp, Minus, MapPinOff, MapPin,
} from 'lucide-react';
import { FLAT_THRESHOLD_FT } from '../holes/holeTerrain';
import { PIN_STATUS, describeConsensus } from '../editor/pinConsensus';

const round5 = (v) => Math.round(v / 5) * 5;

/** Only a surveyed pin earns a terrain reading. See the header. */
export function holeSupportsReading(hole) {
    return hole?.dataQuality === 'measured' && !!hole?.tee && !!hole?.basket;
}

export default function HoleCard({ hole, reading, onPlacePins, consensus }) {
    if (!hole) return null;
    if (!holeSupportsReading(hole)) return <NoReading hole={hole} onPlacePins={onPlacePins} />;
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
                    which numbers in this app to trust. It reports how the
                    PIN was established, not merely that terrain was
                    sampled — the elevation data is always survey-grade,
                    so saying MEASURED over an unconfirmed placement would
                    put the wrong word on the weakest link. */}
                <PinBadge consensus={consensus} />
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

            {consensus?.othersDisagree && (
                <p className="text-micro text-amber-300/80 leading-relaxed mb-2">
                    Other players place this basket elsewhere. This reading
                    follows yours.
                </p>
            )}

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

/**
 * Shown where a hole's pin is derived rather than surveyed. States the
 * reason plainly — an unexplained blank reads as a broken feature, and
 * the explanation happens to be the argument for placing the pin.
 */
function NoReading({ hole, onPlacePins }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="glass-panel p-3.5 w-[320px]"
        >
            <div className="flex items-center gap-2 mb-2">
                <MapPinOff size={14} className="text-truarc-muted/60" />
                <span className="cad-text text-truarc-muted">
                    {hole?.num ? `Hole ${hole.num} · Ground` : 'Ground'}
                </span>
                <span className="ml-auto text-micro font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-truarc-muted/70">
                    NO PIN
                </span>
            </div>
            <p className="text-micro text-truarc-muted/70 leading-relaxed">
                This hole&apos;s basket position is estimated from its listed
                distance and bearing, not surveyed. Reading the ground along a
                line to a pin that might be 70&nbsp;ft off would give you
                confident numbers about the wrong part of the fairway.
            </p>
            {/* The explanation and the fix in one place. Edit mode has
                no toolbar button — it is course-setup tooling, not a
                player mode — so without this the only route to it is an
                undocumented keyboard shortcut, and the single most
                valuable action in the app would go undiscovered. */}
            {onPlacePins ? (
                <button
                    onClick={onPlacePins}
                    className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md
                               bg-truarc-accent/[0.14] border border-truarc-accent/40 text-truarc-accent
                               hover:bg-truarc-accent/[0.22] transition-colors duration-150"
                >
                    <MapPin size={12} />
                    <span className="text-micro">Place the tee and basket</span>
                </button>
            ) : (
                <p className="text-micro text-truarc-muted/45 leading-relaxed mt-1.5">
                    Drop the real basket in the hole editor and the reading appears.
                </p>
            )}
        </motion.div>
    );
}

/**
 * How well established this hole's pin is. Deliberately distinct wording
 * per level: the value of confirmation is entirely in a player being
 * able to tell a corroborated pin from one person's claim at a glance,
 * and collapsing these into one green badge would spend that.
 */
const BADGE = {
    [PIN_STATUS.VERIFIED]: ['VERIFIED', 'bg-emerald-400/10 text-emerald-300/90'],
    [PIN_STATUS.CONFIRMED]: ['CONFIRMED', 'bg-emerald-400/10 text-emerald-300/80'],
    [PIN_STATUS.SELF]: ['YOUR PIN', 'bg-truarc-accent/[0.14] text-truarc-accent'],
};

function PinBadge({ consensus }) {
    const [label, tone] = BADGE[consensus?.status] ?? ['MEASURED', 'bg-emerald-400/10 text-emerald-300/90'];
    return (
        <span
            title={consensus ? describeConsensus(consensus) : undefined}
            className={`ml-auto text-micro font-mono px-2 py-0.5 rounded-full ${tone}`}
        >
            {label}
        </span>
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
