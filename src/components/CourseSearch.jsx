/**
 * CourseSearch — Search modal for finding disc golf / golf courses
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MapPin, Loader2 } from 'lucide-react';

// Popular disc golf courses for quick access
const FEATURED_COURSES = [
    { name: 'Maple Hill', location: 'Leicester, MA', lng: -71.9365, lat: 42.2480, zoom: 17 },
    { name: 'Idlewild', location: 'Burlington, KY', lng: -84.7068, lat: 39.0319, zoom: 17 },
    { name: 'Winthrop Gold', location: 'Rock Hill, SC', lng: -81.0280, lat: 34.9366, zoom: 17 },
    { name: 'Toboggan', location: 'Milford, MI', lng: -83.6210, lat: 42.5836, zoom: 17 },
    { name: 'Emporia CC', location: 'Emporia, KS', lng: -96.1811, lat: 38.4039, zoom: 17 },
    { name: 'De La Veaga', location: 'Santa Cruz, CA', lng: -122.0134, lat: 36.9699, zoom: 17 },
    { name: 'Fountain Hills', location: 'Fountain Hills, AZ', lng: -111.7144, lat: 33.6054, zoom: 17 },
    { name: 'Järva', location: 'Stockholm, Sweden', lng: 17.9950, lat: 59.3948, zoom: 17 },
];

export default function CourseSearch({ isOpen, onClose, onSelectCourse }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSearch = useCallback(async (searchQuery) => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const token = import.meta.env.VITE_MAPBOX_TOKEN;
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${token}&types=poi,place&limit=6`
            );
            const data = await res.json();
            setResults(
                (data.features || []).map((f) => ({
                    name: f.text,
                    location: f.place_name,
                    lng: f.center[0],
                    lat: f.center[1],
                    zoom: 16,
                }))
            );
        } catch (e) {
            console.error('Search failed:', e);
            setResults([]);
        }
        setLoading(false);
    }, []);

    const filteredFeatured = FEATURED_COURSES.filter(
        (c) =>
            !query ||
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            c.location.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg"
                    >
                        <div className="glass-panel p-0 overflow-hidden">
                            {/* Search Input */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-truarc-border/30">
                                <Search size={18} className="text-truarc-accent" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => {
                                        setQuery(e.target.value);
                                        handleSearch(e.target.value);
                                    }}
                                    placeholder="Search for a course or location..."
                                    className="flex-1 bg-transparent text-truarc-text text-sm outline-none placeholder:text-truarc-muted/50 font-mono"
                                />
                                {loading && <Loader2 size={16} className="text-truarc-accent animate-spin" />}
                                <button onClick={onClose} className="text-truarc-muted hover:text-truarc-text transition-colors">
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Results */}
                            <div className="max-h-[400px] overflow-y-auto">
                                {/* Geocoding Results */}
                                {results.length > 0 && (
                                    <div className="p-2">
                                        <div className="cad-label px-2 py-1">Search Results</div>
                                        {results.map((r, i) => (
                                            <CourseItem
                                                key={i}
                                                course={r}
                                                onClick={() => {
                                                    onSelectCourse(r);
                                                    onClose();
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Featured */}
                                <div className="p-2">
                                    <div className="cad-label px-2 py-1">Featured Courses</div>
                                    {filteredFeatured.map((c, i) => (
                                        <CourseItem
                                            key={i}
                                            course={c}
                                            featured
                                            onClick={() => {
                                                onSelectCourse(c);
                                                onClose();
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function CourseItem({ course, featured, onClick }) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-truarc-accent/5 transition-colors group"
        >
            <MapPin
                size={14}
                className={`${featured ? 'text-truarc-green' : 'text-truarc-accent'} opacity-60 group-hover:opacity-100 transition-opacity`}
            />
            <div className="flex-1 min-w-0">
                <div className="text-sm text-truarc-text font-medium truncate">{course.name}</div>
                <div className="text-[11px] text-truarc-muted truncate">{course.location}</div>
            </div>
            {featured && (
                <span className="text-[8px] font-mono text-truarc-green bg-truarc-green/10 px-1.5 py-0.5 rounded-full">
                    FEATURED
                </span>
            )}
        </button>
    );
}
