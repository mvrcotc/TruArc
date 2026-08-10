import React, { useState, useEffect } from 'react';
import { Cloud, CloudRain, Sun, Wind, Droplets } from 'lucide-react';

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

export default function CurrentWeather() {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Get user location via geolocation API
        if (!navigator.geolocation) {
            setError('Geolocation not supported');
            setLoading(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    // Fetch weather from Open-Meteo (no API key required)
                    const response = await fetch(
                        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`
                    );
                    if (!response.ok) throw new Error('Weather fetch failed');
                    const data = await response.json();
                    setWeather(data.current);
                    setLoading(false);
                } catch (err) {
                    setError(err.message);
                    setLoading(false);
                }
            },
            (err) => {
                setError('Location access denied');
                setLoading(false);
            }
        );
    }, []);

    if (loading) {
        return (
            <div className="h-20 bg-gradient-to-r from-truarc-accent/5 to-truarc-accent/10 rounded-lg border border-white/[0.08] animate-pulse" />
        );
    }

    if (error || !weather) {
        return null;
    }

    const Icon = WEATHER_ICONS[weather.weather_code] || Cloud;
    const description = WEATHER_DESCRIPTIONS[weather.weather_code] || 'Unknown';
    const temp = Math.round(weather.temperature_2m);
    const humidity = weather.relative_humidity_2m;
    const windSpeed = Math.round(weather.wind_speed_10m);

    // Gradient direction and intensity based on weather code
    let gradientClass = 'from-blue-500/15 to-blue-600/10'; // Clear/default
    if (weather.weather_code >= 45 && weather.weather_code <= 48) {
        gradientClass = 'from-slate-500/15 to-slate-600/10'; // Fog
    } else if (weather.weather_code >= 51 && weather.weather_code <= 82) {
        gradientClass = 'from-slate-600/15 to-slate-700/10'; // Rain
    } else if (weather.weather_code >= 2 && weather.weather_code <= 3) {
        gradientClass = 'from-slate-500/15 to-slate-600/10'; // Clouds
    }

    return (
        <div className={`bg-gradient-to-r ${gradientClass} rounded-lg border border-white/[0.08] p-4 backdrop-blur-sm`}>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-white/[0.08]">
                        <Icon size={24} className="text-truarc-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm text-truarc-muted/70 leading-tight">{description}</div>
                        <div className="text-2xl font-semibold text-truarc-text leading-none">
                            {temp}°
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.05]">
                        <Wind size={14} className="text-truarc-accent/80" />
                        <span className="text-sm text-truarc-text font-mono">{windSpeed} mph</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.05]">
                        <Droplets size={14} className="text-truarc-accent/80" />
                        <span className="text-sm text-truarc-text font-mono">{humidity}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
