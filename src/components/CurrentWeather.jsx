import React, { useState, useEffect } from 'react';
import { Cloud, CloudRain, Sun, Wind, Droplets, Thermometer } from 'lucide-react';

const WEATHER_ICONS = {
    0: Sun,           // Clear sky
    1: Sun,           // Mainly clear
    2: Cloud,         // Partly cloudy
    3: Cloud,         // Overcast
    45: Cloud,        // Foggy
    48: Cloud,        // Depositing rime fog
    51: CloudRain,    // Light drizzle
    53: CloudRain,    // Moderate drizzle
    55: CloudRain,    // Dense drizzle
    61: CloudRain,    // Slight rain
    63: CloudRain,    // Moderate rain
    65: CloudRain,    // Heavy rain
    80: CloudRain,    // Slight rain showers
    81: CloudRain,    // Moderate rain showers
    82: CloudRain,    // Violent rain showers
};

const WEATHER_DESCRIPTIONS = {
    0: 'Clear',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Heavy drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    80: 'Rain showers',
    81: 'Showers',
    82: 'Heavy showers',
};

/**
 * Displays current weather for the selected course location.
 * Fetches from Open-Meteo API (no auth required).
 * Positioned above the left panel and styled to match glass-panel aesthetic.
 */
export default function CurrentWeather({ latitude, longitude }) {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(false);

    // Fetch weather when coordinates change
    useEffect(() => {
        if (!latitude || !longitude) {
            setWeather(null);
            return;
        }

        setLoading(true);
        const fetchWeather = async () => {
            try {
                const response = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`
                );
                if (!response.ok) throw new Error('Weather fetch failed');
                const data = await response.json();
                setWeather(data.current);
            } catch (err) {
                console.warn('Failed to fetch weather:', err.message);
                setWeather(null);
            } finally {
                setLoading(false);
            }
        };

        fetchWeather();
    }, [latitude, longitude]);

    if (!weather || loading) {
        return null;
    }

    const Icon = WEATHER_ICONS[weather.weather_code] || Cloud;
    const description = WEATHER_DESCRIPTIONS[weather.weather_code] || 'Unknown';
    const temp = Math.round(weather.temperature_2m);
    const humidity = weather.relative_humidity_2m;
    const windSpeed = Math.round(weather.wind_speed_10m);

    return (
        <div className="glass-panel w-[320px] p-3.5">
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-white/[0.08] shrink-0">
                    <Icon size={20} className="text-truarc-accent" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-micro text-truarc-muted/60 leading-tight">{description}</div>
                    <div className="flex items-baseline gap-2">
                        <div className="text-2xl font-semibold text-truarc-text leading-none">
                            {temp}°
                        </div>
                        <div className="flex items-center gap-2 text-micro text-truarc-muted/70">
                            <Wind size={12} />
                            <span>{windSpeed} mph</span>
                            <span className="mx-1">·</span>
                            <Droplets size={12} />
                            <span>{humidity}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
