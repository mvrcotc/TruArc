/**
 * AnimatedNumber — a data readout that glides to its new value instead
 * of snapping. The continuity is the point: when a slider drag
 * re-simulates a flight thirty times a second, a snapping number reads
 * as flicker while a springing one reads as measurement.
 *
 * Renders a plain <span> (no layout impact); `tabular-nums` on the
 * caller keeps the width stable while digits change. Non-finite values
 * (— placeholders, missing data) render as-is with no animation —
 * animating from NaN is how you get a panel full of garbage.
 */
import React, { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

export default function AnimatedNumber({ value, decimals = 0, className, style, prefix = '', suffix = '' }) {
    const numeric = typeof value === 'number' && Number.isFinite(value);
    const spring = useSpring(numeric ? value : 0, { stiffness: 180, damping: 28, mass: 0.6 });

    useEffect(() => {
        if (numeric) spring.set(value);
    }, [numeric, value, spring]);

    const text = useTransform(spring, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`);

    if (!numeric) {
        return <span className={className} style={style}>{String(value ?? '—')}</span>;
    }
    return <motion.span className={className} style={style}>{text}</motion.span>;
}
