/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Current conditions at the course                                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * ── THIS COMPONENT USED TO SHIP WRONG NUMBERS ────────────────────────
 * Its first version called Open-Meteo directly and requested no units.
 * Open-Meteo defaults to Celsius and km/h, so it rendered 27 °C as "27°"
 * and 7 km/h as "7 mph" — a temperature 50° off and a wind speed
 * overstated by 1.6×, both presented with total confidence.
 *
 * The bug was not the arithmetic. It was bypassing
 * `src/utils/weather.js`, which already asks for explicit units AND
 * normalises against the units the RESPONSE declares rather than the
 * ones it requested. That module's header warns about this exact
 * failure; the fix is to go through it, not to re-derive it here.
 *
 * So this component now takes the ALREADY-PARSED observation that App
 * fetches for WeatherPanel. One fetch, one unit path, and the two
 * panels cannot disagree about the weather at the same course.
 *
 * ── WIND LIVES IN THE WIND PANEL, NOT HERE ───────────────────────────
 * This card carries the AMBIENT conditions — temperature, sky, humidity
 * — and deliberately no wind speed, even though the observation it
 * reads carries one. Wind is the reading that changes how you throw, so
 * it gets the panel below with its direction, its gusts, and how it
 * plays on the hole you are looking at. Printing the speed in both
 * places would be the same number twice with less context in one of
 * them.
 *
 * ── CANONICAL UNITS IN, DISPLAY UNITS OUT ────────────────────────────
 * The observation is metric by construction (°C, m/s) because that is
 * what the physics consumes. Conversion to °F and mph happens HERE, at
 * the edge, and nowhere else — a display concern must never travel back
 * up into the data.
 */

import React from 'react';
import { Cloud, CloudRain, CloudFog, Sun, CloudSun, Droplets } from 'lucide-react';

const cToF = (c) => (c * 9) / 5 + 32;

/**
 * WMO weather codes → icon and label. Only codes Open-Meteo actually
 * emits are listed; anything unmapped falls through to a neutral cloud
 * rather than guessing, because a wrong sky icon is a small lie that
 * makes a player doubt the numbers next to it.
 */
const CONDITIONS = {
    0: [Sun, 'Clear'],
    1: [Sun, 'Mainly clear'],
    2: [CloudSun, 'Partly cloudy'],
    3: [Cloud, 'Overcast'],
    45: [CloudFog, 'Fog'],
    48: [CloudFog, 'Freezing fog'],
    51: [CloudRain, 'Light drizzle'],
    53: [CloudRain, 'Drizzle'],
    55: [CloudRain, 'Heavy drizzle'],
    61: [CloudRain, 'Light rain'],
    63: [CloudRain, 'Rain'],
    65: [CloudRain, 'Heavy rain'],
    71: [CloudRain, 'Light snow'],
    73: [CloudRain, 'Snow'],
    75: [CloudRain, 'Heavy snow'],
    80: [CloudRain, 'Showers'],
    81: [CloudRain, 'Showers'],
    82: [CloudRain, 'Heavy showers'],
    95: [CloudRain, 'Thunderstorm'],
};

export default function CurrentWeather({ observed, state }) {
    // No observation is a normal state, not an error: this environment's
    // egress blocks the weather API, and a course can be anywhere.
    // Rendering nothing is right — a placeholder implies data is coming.
    if (state === 'loading' || !observed) return null;

    const [Icon, label] = CONDITIONS[observed.weatherCode] ?? [Cloud, null];
    const tempF = observed.temperatureC == null ? null : Math.round(cToF(observed.temperatureC));

    return (
        <div className="glass-panel w-[320px] p-3.5">
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/[0.06] shrink-0">
                    <Icon size={18} className="text-truarc-accent" />
                </div>

                <div className="min-w-0">
                    {label && (
                        <span className="block text-micro text-truarc-muted/60 leading-tight">{label}</span>
                    )}
                    {tempF != null && (
                        <span className="block text-xl font-mono tabular-nums text-truarc-text leading-none mt-0.5">
                            {tempF}°F
                        </span>
                    )}
                </div>

                {/* Omitted rather than defaulted when the service did not
                    report it — see weather.js. */}
                {observed.humidityPct != null && (
                    <div className="ml-auto">
                        <Reading Icon={Droplets} value={`${observed.humidityPct}%`} />
                    </div>
                )}
            </div>
        </div>
    );
}

function Reading({ Icon, value }) {
    return (
        <span className="flex items-center gap-1.5 text-micro text-truarc-muted/80">
            <Icon size={12} className="text-truarc-accent/70" />
            <span className="font-mono tabular-nums">{value}</span>
        </span>
    );
}
