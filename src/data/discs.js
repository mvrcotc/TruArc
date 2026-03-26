/**
 * TruArc Disc Database
 * Official flight numbers (Speed, Glide, Turn, Fade) from manufacturer specs.
 * Sources: Innova, Discraft, Dynamic Discs, MVP, Axiom, Latitude 64,
 * Westside, Discmania, Prodigy, Kastaplast, Streamline, DGA, Gateway.
 */

export const DISC_DATABASE = [
    // ═══════════════════════════════════════════════════════════════
    // DISTANCE DRIVERS (Speed 10+)
    // ═══════════════════════════════════════════════════════════════

    // Innova
    { name: 'Destroyer', speed: 12, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Wraith', speed: 11, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Tern', speed: 12, glide: 6, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Shryke', speed: 13, glide: 6, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Corvette', speed: 14, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Boss', speed: 13, glide: 5, turn: 0, fade: 3, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Katana', speed: 13, glide: 5, turn: -3, fade: 3, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Archon', speed: 11, glide: 5, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Mystere', speed: 11, glide: 6, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Mamba', speed: 11, glide: 6, turn: -5, fade: 1, type: 'Distance Driver', brand: 'Innova' },
    { name: 'Krait', speed: 11, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Innova' },

    // Discraft
    { name: 'Zeus', speed: 12, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Nuke', speed: 13, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Force', speed: 12, glide: 5, turn: 0, fade: 3, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Hades', speed: 12, glide: 6, turn: -3, fade: 2, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Thrasher', speed: 12, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Crank', speed: 13, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Scorch', speed: 11, glide: 6, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Surge', speed: 11, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Surge SS', speed: 11, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Nuke SS', speed: 13, glide: 5, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Crank SS', speed: 13, glide: 5, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Discraft' },
    { name: 'Astronaut', speed: 11, glide: 6, turn: -3, fade: 1, type: 'Distance Driver', brand: 'Discraft' },

    // Dynamic Discs
    { name: 'Trespass', speed: 12, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Dynamic Discs' },
    { name: 'Renegade', speed: 11, glide: 6, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Dynamic Discs' },
    { name: 'Enforcer', speed: 12, glide: 5, turn: 0, fade: 4, type: 'Distance Driver', brand: 'Dynamic Discs' },
    { name: 'Raider', speed: 12, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Dynamic Discs' },
    { name: 'Sheriff', speed: 11, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Dynamic Discs' },

    // MVP
    { name: 'Photon', speed: 11, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'MVP' },
    { name: 'Wave', speed: 11, glide: 5, turn: -2, fade: 2, type: 'Distance Driver', brand: 'MVP' },
    { name: 'Catalyst', speed: 13, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'MVP' },
    { name: 'Octane', speed: 13, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'MVP' },
    { name: 'Defy', speed: 11, glide: 5, turn: 0, fade: 3, type: 'Distance Driver', brand: 'MVP' },
    { name: 'Phase', speed: 11, glide: 5, turn: 0, fade: 4, type: 'Distance Driver', brand: 'MVP' },
    { name: 'Orbital', speed: 11, glide: 6, turn: -3, fade: 1, type: 'Distance Driver', brand: 'MVP' },
    { name: 'Teleport', speed: 14, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'MVP' },

    // Axiom
    { name: 'Vanish', speed: 11, glide: 5, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Axiom' },
    { name: 'Thrill', speed: 11, glide: 5, turn: 0, fade: 3, type: 'Distance Driver', brand: 'Axiom' },

    // Latitude 64
    { name: 'Grace', speed: 11, glide: 6, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Latitude 64' },
    { name: 'Rive', speed: 13, glide: 5, turn: 0, fade: 3, type: 'Distance Driver', brand: 'Latitude 64' },
    { name: 'Ballista', speed: 14, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Latitude 64' },
    { name: 'Ballista Pro', speed: 14, glide: 4, turn: 0, fade: 3, type: 'Distance Driver', brand: 'Latitude 64' },
    { name: 'Saint', speed: 9, glide: 7, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Latitude 64' },
    { name: 'Flow', speed: 11, glide: 6, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Latitude 64' },

    // Westside Discs
    { name: 'King', speed: 14, glide: 5, turn: -1, fade: 4, type: 'Distance Driver', brand: 'Westside' },
    { name: 'Queen', speed: 14, glide: 5, turn: -3, fade: 2, type: 'Distance Driver', brand: 'Westside' },
    { name: 'World', speed: 14, glide: 5, turn: 0, fade: 3, type: 'Distance Driver', brand: 'Westside' },
    { name: 'Giant', speed: 13, glide: 5, turn: 0, fade: 3, type: 'Distance Driver', brand: 'Westside' },
    { name: 'Sword', speed: 12, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Westside' },
    { name: 'Catapult', speed: 14, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Westside' },
    { name: 'Destiny', speed: 14, glide: 6, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Westside' },
    { name: 'Sorcerer', speed: 13, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Westside' },

    // Discmania
    { name: 'DD3', speed: 12, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Discmania' },
    { name: 'DD1', speed: 11, glide: 6, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Discmania' },
    { name: 'Enigma', speed: 11, glide: 6, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Discmania' },
    { name: 'PD2', speed: 12, glide: 4, turn: 0, fade: 4, type: 'Distance Driver', brand: 'Discmania' },
    { name: 'DD', speed: 11, glide: 6, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Discmania' },
    { name: 'Mentor', speed: 11, glide: 6, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Discmania' },
    { name: 'Time-Lapse', speed: 12, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'Discmania' },

    // Prodigy
    { name: 'D1', speed: 12, glide: 5, turn: 0, fade: 4, type: 'Distance Driver', brand: 'Prodigy' },
    { name: 'D2', speed: 12, glide: 5, turn: 0, fade: 3, type: 'Distance Driver', brand: 'Prodigy' },
    { name: 'D3', speed: 12, glide: 6, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Prodigy' },
    { name: 'D4', speed: 12, glide: 6, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Prodigy' },
    { name: 'D3 Max', speed: 12, glide: 6, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Prodigy' },
    { name: 'X3', speed: 11, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Prodigy' },
    { name: 'X4', speed: 11, glide: 5, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Prodigy' },
    { name: 'D6', speed: 12, glide: 6, turn: -3, fade: 1, type: 'Distance Driver', brand: 'Prodigy' },

    // Kastaplast
    { name: 'Guld', speed: 13, glide: 5, turn: 0, fade: 3, type: 'Distance Driver', brand: 'Kastaplast' },
    { name: 'Vass', speed: 12, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Kastaplast' },
    { name: 'Krut', speed: 13, glide: 5, turn: 0, fade: 4, type: 'Distance Driver', brand: 'Kastaplast' },
    { name: 'Alva', speed: 11, glide: 6, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Kastaplast' },
    { name: 'Rask', speed: 14, glide: 4, turn: 0, fade: 5, type: 'Distance Driver', brand: 'Kastaplast' },

    // Streamline
    { name: 'Trace', speed: 11, glide: 5, turn: -1, fade: 2, type: 'Distance Driver', brand: 'Streamline' },
    { name: 'Jet', speed: 11, glide: 5, turn: -2, fade: 2, type: 'Distance Driver', brand: 'Streamline' },
    { name: 'Flare', speed: 9, glide: 3, turn: 0, fade: 4, type: 'Distance Driver', brand: 'Streamline' },

    // DGA
    { name: 'Hurricane', speed: 12, glide: 5, turn: -1, fade: 3, type: 'Distance Driver', brand: 'DGA' },
    { name: 'Rogue', speed: 11, glide: 4, turn: -1, fade: 1, type: 'Distance Driver', brand: 'DGA' },
    { name: 'Sail', speed: 11, glide: 6, turn: -4, fade: 1, type: 'Distance Driver', brand: 'DGA' },

    // ═══════════════════════════════════════════════════════════════
    // FAIRWAY DRIVERS (Speed 6–9)
    // ═══════════════════════════════════════════════════════════════

    // Innova
    { name: 'Thunderbird', speed: 9, glide: 5, turn: 0, fade: 2, type: 'Fairway Driver', brand: 'Innova' },
    { name: 'Firebird', speed: 9, glide: 3, turn: 0, fade: 4, type: 'Fairway Driver', brand: 'Innova' },
    { name: 'Teebird', speed: 7, glide: 5, turn: 0, fade: 2, type: 'Fairway Driver', brand: 'Innova' },
    { name: 'Teebird3', speed: 8, glide: 4, turn: 0, fade: 2, type: 'Fairway Driver', brand: 'Innova' },
    { name: 'Leopard', speed: 6, glide: 5, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Innova' },
    { name: 'Leopard3', speed: 7, glide: 5, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Innova' },
    { name: 'Valkyrie', speed: 9, glide: 4, turn: -2, fade: 2, type: 'Fairway Driver', brand: 'Innova' },
    { name: 'Sidewinder', speed: 9, glide: 5, turn: -3, fade: 1, type: 'Fairway Driver', brand: 'Innova' },
    { name: 'Roadrunner', speed: 9, glide: 5, turn: -4, fade: 1, type: 'Fairway Driver', brand: 'Innova' },
    { name: 'Eagle', speed: 7, glide: 4, turn: -1, fade: 3, type: 'Fairway Driver', brand: 'Innova' },
    { name: 'TL3', speed: 8, glide: 4, turn: 0, fade: 1, type: 'Fairway Driver', brand: 'Innova' },

    // Discraft
    { name: 'Undertaker', speed: 9, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Discraft' },
    { name: 'Stalker', speed: 7, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Discraft' },
    { name: 'Raptor', speed: 9, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'Discraft' },
    { name: 'Raptor Strike', speed: 9, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'Discraft' },
    { name: 'Heat', speed: 9, glide: 6, turn: -3, fade: 1, type: 'Fairway Driver', brand: 'Discraft' },
    { name: 'Mantis', speed: 8, glide: 5, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Discraft' },
    { name: 'Passion', speed: 8, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Discraft' },
    { name: 'Athena', speed: 7, glide: 5, turn: 0, fade: 2, type: 'Fairway Driver', brand: 'Discraft' },
    { name: 'Anax', speed: 10, glide: 5, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'Discraft' },

    // Dynamic Discs
    { name: 'Felon', speed: 9, glide: 3, turn: 0, fade: 4, type: 'Fairway Driver', brand: 'Dynamic Discs' },
    { name: 'Getaway', speed: 9, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Dynamic Discs' },
    { name: 'Escape', speed: 9, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Dynamic Discs' },
    { name: 'Evader', speed: 8, glide: 5, turn: 0, fade: 2, type: 'Fairway Driver', brand: 'Dynamic Discs' },
    { name: 'Explorer', speed: 7, glide: 5, turn: 0, fade: 2, type: 'Fairway Driver', brand: 'Dynamic Discs' },
    { name: 'Maverick', speed: 7, glide: 5, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Dynamic Discs' },
    { name: 'Vandal', speed: 9, glide: 6, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Dynamic Discs' },

    // MVP
    { name: 'Volt', speed: 8, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'MVP' },
    { name: 'Terra', speed: 8, glide: 5, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'MVP' },
    { name: 'Tesla', speed: 9, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'MVP' },
    { name: 'Servo', speed: 6, glide: 5, turn: -1, fade: 1, type: 'Fairway Driver', brand: 'MVP' },
    { name: 'Resistor', speed: 6, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'MVP' },
    { name: 'Inertia', speed: 9, glide: 5, turn: -2, fade: 2, type: 'Fairway Driver', brand: 'MVP' },

    // Axiom
    { name: 'Crave', speed: 6, glide: 5, turn: -1, fade: 1, type: 'Fairway Driver', brand: 'Axiom' },
    { name: 'Clash', speed: 8, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Axiom' },
    { name: 'Insanity', speed: 9, glide: 5, turn: -2, fade: 2, type: 'Fairway Driver', brand: 'Axiom' },
    { name: 'Fireball', speed: 9, glide: 3, turn: 0, fade: 4, type: 'Fairway Driver', brand: 'Axiom' },

    // Latitude 64
    { name: 'River', speed: 7, glide: 7, turn: -1, fade: 1, type: 'Fairway Driver', brand: 'Latitude 64' },
    { name: 'Saint Pro', speed: 9, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'Latitude 64' },
    { name: 'Pioneer', speed: 9, glide: 3, turn: 0, fade: 4, type: 'Fairway Driver', brand: 'Latitude 64' },
    { name: 'Diamond', speed: 8, glide: 6, turn: -3, fade: 1, type: 'Fairway Driver', brand: 'Latitude 64' },
    { name: 'Maul', speed: 7, glide: 7, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Latitude 64' },
    { name: 'Stiletto', speed: 13, glide: 4, turn: 0, fade: 5, type: 'Distance Driver', brand: 'Latitude 64' },

    // Westside Discs
    { name: 'Hatchet', speed: 9, glide: 6, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Westside' },
    { name: 'Seer', speed: 7, glide: 6, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Westside' },
    { name: 'Stag', speed: 8, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Westside' },
    { name: 'Northman', speed: 10, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Westside' },
    { name: 'Fortress', speed: 9, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'Westside' },
    { name: 'Boatman', speed: 11, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Westside' },

    // Discmania
    { name: 'FD3', speed: 9, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'Discmania' },
    { name: 'FD', speed: 7, glide: 6, turn: -1, fade: 1, type: 'Fairway Driver', brand: 'Discmania' },
    { name: 'FD1', speed: 8, glide: 5, turn: 0, fade: 2, type: 'Fairway Driver', brand: 'Discmania' },
    { name: 'Essence', speed: 8, glide: 6, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Discmania' },
    { name: 'Instinct', speed: 8, glide: 5, turn: 0, fade: 2, type: 'Fairway Driver', brand: 'Discmania' },
    { name: 'PD', speed: 10, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'Discmania' },

    // Prodigy
    { name: 'F1', speed: 7, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'Prodigy' },
    { name: 'F2', speed: 7, glide: 5, turn: 0, fade: 2, type: 'Fairway Driver', brand: 'Prodigy' },
    { name: 'F3', speed: 7, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Prodigy' },
    { name: 'F5', speed: 8, glide: 6, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Prodigy' },
    { name: 'F7', speed: 7, glide: 6, turn: -3, fade: 1, type: 'Fairway Driver', brand: 'Prodigy' },
    { name: 'H3 V2', speed: 10, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Prodigy' },

    // Kastaplast
    { name: 'Falk', speed: 9, glide: 6, turn: -2, fade: 1, type: 'Fairway Driver', brand: 'Kastaplast' },
    { name: 'Lots', speed: 9, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Kastaplast' },
    { name: 'Stål', speed: 9, glide: 3, turn: 0, fade: 4, type: 'Fairway Driver', brand: 'Kastaplast' },
    { name: 'Kaxe', speed: 6, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'Kastaplast' },
    { name: 'Kaxe Z', speed: 6, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'Kastaplast' },

    // Streamline
    { name: 'Drift', speed: 7, glide: 5, turn: -1, fade: 1, type: 'Fairway Driver', brand: 'Streamline' },
    { name: 'Lift', speed: 9, glide: 5, turn: -2, fade: 2, type: 'Fairway Driver', brand: 'Streamline' },
    { name: 'Runway', speed: 5, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'Streamline' },

    // DGA
    { name: 'Pipeline', speed: 8, glide: 5, turn: -1, fade: 2, type: 'Fairway Driver', brand: 'DGA' },
    { name: 'Banzai', speed: 8, glide: 4, turn: 0, fade: 3, type: 'Fairway Driver', brand: 'DGA' },

    // Gateway
    { name: 'Diamond', speed: 9, glide: 5, turn: -2, fade: 2, type: 'Fairway Driver', brand: 'Gateway' },

    // ═══════════════════════════════════════════════════════════════
    // MIDRANGES (Speed 4–6)
    // ═══════════════════════════════════════════════════════════════

    // Innova
    { name: 'Roc3', speed: 5, glide: 4, turn: 0, fade: 3, type: 'Midrange', brand: 'Innova' },
    { name: 'Roc', speed: 4, glide: 4, turn: 0, fade: 3, type: 'Midrange', brand: 'Innova' },
    { name: 'Mako3', speed: 5, glide: 5, turn: 0, fade: 0, type: 'Midrange', brand: 'Innova' },
    { name: 'Croc', speed: 4, glide: 2, turn: 0, fade: 4, type: 'Midrange', brand: 'Innova' },
    { name: 'Coyote', speed: 5, glide: 4, turn: 0, fade: 1, type: 'Midrange', brand: 'Innova' },
    { name: 'Atlas', speed: 5, glide: 4, turn: 0, fade: 1, type: 'Midrange', brand: 'Innova' },
    { name: 'Lion', speed: 5, glide: 4, turn: 0, fade: 2, type: 'Midrange', brand: 'Innova' },
    { name: 'Gator', speed: 5, glide: 2, turn: 0, fade: 4, type: 'Midrange', brand: 'Innova' },

    // Discraft
    { name: 'Buzzz', speed: 5, glide: 4, turn: -1, fade: 1, type: 'Midrange', brand: 'Discraft' },
    { name: 'Buzzz SS', speed: 5, glide: 4, turn: -2, fade: 1, type: 'Midrange', brand: 'Discraft' },
    { name: 'Buzzz OS', speed: 5, glide: 4, turn: 1, fade: 3, type: 'Midrange', brand: 'Discraft' },
    { name: 'Malta', speed: 5, glide: 4, turn: 1, fade: 3, type: 'Midrange', brand: 'Discraft' },
    { name: 'Wasp', speed: 5, glide: 4, turn: 0, fade: 2, type: 'Midrange', brand: 'Discraft' },
    { name: 'Meteor', speed: 5, glide: 5, turn: -3, fade: 1, type: 'Midrange', brand: 'Discraft' },
    { name: 'Comet', speed: 5, glide: 5, turn: -2, fade: 1, type: 'Midrange', brand: 'Discraft' },
    { name: 'Hornet', speed: 5, glide: 4, turn: 0, fade: 3, type: 'Midrange', brand: 'Discraft' },

    // Dynamic Discs
    { name: 'EMAC Truth', speed: 5, glide: 5, turn: 0, fade: 2, type: 'Midrange', brand: 'Dynamic Discs' },
    { name: 'Truth', speed: 5, glide: 5, turn: -1, fade: 1, type: 'Midrange', brand: 'Dynamic Discs' },
    { name: 'Verdict', speed: 5, glide: 4, turn: 0, fade: 4, type: 'Midrange', brand: 'Dynamic Discs' },
    { name: 'Evidence', speed: 5, glide: 5, turn: -2, fade: 1, type: 'Midrange', brand: 'Dynamic Discs' },
    { name: 'Bounty', speed: 5, glide: 5, turn: -1, fade: 1, type: 'Midrange', brand: 'Dynamic Discs' },

    // MVP
    { name: 'Reactor', speed: 5, glide: 5, turn: 0, fade: 2, type: 'Midrange', brand: 'MVP' },
    { name: 'Matrix', speed: 5, glide: 4, turn: -1, fade: 2, type: 'Midrange', brand: 'MVP' },
    { name: 'Deflector', speed: 5, glide: 3, turn: 0, fade: 4, type: 'Midrange', brand: 'MVP' },
    { name: 'Tangent', speed: 5, glide: 5, turn: -1, fade: 1, type: 'Midrange', brand: 'MVP' },

    // Axiom
    { name: 'Hex', speed: 5, glide: 5, turn: -1, fade: 1, type: 'Midrange', brand: 'Axiom' },
    { name: 'Pyro', speed: 5, glide: 4, turn: 0, fade: 3, type: 'Midrange', brand: 'Axiom' },
    { name: 'Prism Pyro', speed: 5, glide: 4, turn: 0, fade: 3, type: 'Midrange', brand: 'Axiom' },

    // Latitude 64
    { name: 'Fuse', speed: 5, glide: 6, turn: -1, fade: 0, type: 'Midrange', brand: 'Latitude 64' },
    { name: 'Compass', speed: 5, glide: 5, turn: 0, fade: 1, type: 'Midrange', brand: 'Latitude 64' },
    { name: 'Claymore', speed: 5, glide: 5, turn: -1, fade: 1, type: 'Midrange', brand: 'Latitude 64' },
    { name: 'Trust', speed: 5, glide: 5, turn: 0, fade: 2, type: 'Midrange', brand: 'Latitude 64' },
    { name: 'Anchor', speed: 5, glide: 4, turn: 0, fade: 3, type: 'Midrange', brand: 'Latitude 64' },
    // Westside Discs (Harp is Westside)
    { name: 'Warship', speed: 6, glide: 5, turn: 0, fade: 1, type: 'Midrange', brand: 'Westside' },
    { name: 'Gatekeeper', speed: 5, glide: 4, turn: 0, fade: 2, type: 'Midrange', brand: 'Westside' },
    { name: 'Tursas', speed: 5, glide: 6, turn: -2, fade: 1, type: 'Midrange', brand: 'Westside' },
    { name: 'Anvil', speed: 5, glide: 2, turn: 0, fade: 4, type: 'Midrange', brand: 'Westside' },

    // Discmania
    { name: 'MD3', speed: 5, glide: 5, turn: 0, fade: 2, type: 'Midrange', brand: 'Discmania' },
    { name: 'MD1', speed: 5, glide: 5, turn: 0, fade: 0, type: 'Midrange', brand: 'Discmania' },
    { name: 'Origin', speed: 5, glide: 5, turn: -1, fade: 1, type: 'Midrange', brand: 'Discmania' },
    { name: 'Method', speed: 5, glide: 5, turn: 0, fade: 2, type: 'Midrange', brand: 'Discmania' },
    { name: 'Razor Claw 3', speed: 4, glide: 3, turn: 0, fade: 3, type: 'Midrange', brand: 'Discmania' },

    // Prodigy
    { name: 'M1', speed: 5, glide: 4, turn: 0, fade: 3, type: 'Midrange', brand: 'Prodigy' },
    { name: 'M2', speed: 5, glide: 4, turn: 0, fade: 2, type: 'Midrange', brand: 'Prodigy' },
    { name: 'M3', speed: 5, glide: 5, turn: -1, fade: 2, type: 'Midrange', brand: 'Prodigy' },
    { name: 'M4', speed: 5, glide: 5, turn: -1, fade: 1, type: 'Midrange', brand: 'Prodigy' },
    { name: 'MX-3', speed: 5, glide: 4, turn: 0, fade: 2, type: 'Midrange', brand: 'Prodigy' },

    // Kastaplast
    { name: 'Göte', speed: 5, glide: 5, turn: 0, fade: 0, type: 'Midrange', brand: 'Kastaplast' },
    { name: 'Svea', speed: 5, glide: 6, turn: -2, fade: 0, type: 'Midrange', brand: 'Kastaplast' },
    { name: 'Järn', speed: 4, glide: 3, turn: 0, fade: 3, type: 'Midrange', brand: 'Kastaplast' },

    // Streamline
    { name: 'Echo', speed: 5, glide: 5, turn: -1, fade: 1, type: 'Midrange', brand: 'Streamline' },

    // ═══════════════════════════════════════════════════════════════
    // PUTTERS & APPROACH (Speed 1–4)
    // ═══════════════════════════════════════════════════════════════

    // Innova
    { name: 'Aviar', speed: 2, glide: 3, turn: 0, fade: 1, type: 'Putter', brand: 'Innova' },
    { name: 'Aviar3', speed: 3, glide: 3, turn: 0, fade: 1, type: 'Putter', brand: 'Innova' },
    { name: 'AviarX3', speed: 3, glide: 2, turn: 0, fade: 3, type: 'Putter', brand: 'Innova' },
    { name: 'Pig', speed: 3, glide: 1, turn: 0, fade: 3, type: 'Putter', brand: 'Innova' },
    { name: 'Rhyno', speed: 2, glide: 1, turn: 0, fade: 3, type: 'Putter', brand: 'Innova' },
    { name: 'Colt', speed: 3, glide: 4, turn: -1, fade: 1, type: 'Putter', brand: 'Innova' },
    { name: 'Invader', speed: 3, glide: 3, turn: 0, fade: 1, type: 'Putter', brand: 'Innova' },

    // Discraft
    { name: 'Luna', speed: 3, glide: 3, turn: 0, fade: 3, type: 'Putter', brand: 'Discraft' },
    { name: 'Zone', speed: 4, glide: 3, turn: 0, fade: 3, type: 'Putter', brand: 'Discraft' },
    { name: 'Fierce', speed: 3, glide: 4, turn: -1, fade: 1, type: 'Putter', brand: 'Discraft' },
    { name: 'Roach', speed: 2, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'Discraft' },
    { name: 'Challenger', speed: 2, glide: 3, turn: 0, fade: 2, type: 'Putter', brand: 'Discraft' },
    { name: 'Challenger OS', speed: 2, glide: 3, turn: 0, fade: 3, type: 'Putter', brand: 'Discraft' },
    { name: 'Ringer', speed: 3, glide: 3, turn: 0, fade: 2, type: 'Putter', brand: 'Discraft' },
    { name: 'Hawk', speed: 2, glide: 4, turn: -1, fade: 1, type: 'Putter', brand: 'Discraft' },

    // Dynamic Discs
    { name: 'Judge', speed: 2, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'Dynamic Discs' },
    { name: 'EMAC Judge', speed: 2, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'Dynamic Discs' },
    { name: 'Warden', speed: 2, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'Dynamic Discs' },
    { name: 'Slammer', speed: 3, glide: 1, turn: 0, fade: 4, type: 'Putter', brand: 'Dynamic Discs' },
    // MVP
    { name: 'Ion', speed: 2, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'MVP' },
    { name: 'Anode', speed: 2, glide: 3, turn: 0, fade: 0, type: 'Putter', brand: 'MVP' },
    { name: 'Nomad', speed: 2, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'MVP' },
    { name: 'Spin', speed: 3, glide: 5, turn: -2, fade: 0, type: 'Putter', brand: 'MVP' },
    { name: 'Entropy', speed: 4, glide: 2, turn: 0, fade: 3, type: 'Putter', brand: 'MVP' },

    // Axiom
    { name: 'Envy', speed: 3, glide: 3, turn: 0, fade: 2, type: 'Putter', brand: 'Axiom' },
    { name: 'Proxy', speed: 3, glide: 4, turn: -1, fade: 0, type: 'Putter', brand: 'Axiom' },
    { name: 'Pilot', speed: 2, glide: 5, turn: 0, fade: 1, type: 'Putter', brand: 'Axiom' },

    // Latitude 64
    { name: 'Pure', speed: 3, glide: 3, turn: -1, fade: 1, type: 'Putter', brand: 'Latitude 64' },
    { name: 'Dagger', speed: 2, glide: 4, turn: 0, fade: 2, type: 'Putter', brand: 'Latitude 64' },
    { name: 'Keystone', speed: 2, glide: 5, turn: -1, fade: 1, type: 'Putter', brand: 'Latitude 64' },
    { name: 'Sinus', speed: 3, glide: 2, turn: 0, fade: 3, type: 'Putter', brand: 'Latitude 64' },
    // Westside Discs
    { name: 'Harp', speed: 4, glide: 3, turn: 0, fade: 3, type: 'Putter', brand: 'Westside' },
    { name: 'Shield', speed: 2, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'Westside' },
    { name: 'Maiden', speed: 3, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'Westside' },
    { name: 'Crown', speed: 2, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'Westside' },

    // Discmania
    { name: 'P2', speed: 2, glide: 3, turn: 0, fade: 2, type: 'Putter', brand: 'Discmania' },
    { name: 'Tactic', speed: 4, glide: 2, turn: 0, fade: 3, type: 'Putter', brand: 'Discmania' },
    { name: 'Logic', speed: 2, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'Discmania' },
    { name: 'Sensei', speed: 2, glide: 4, turn: -1, fade: 1, type: 'Putter', brand: 'Discmania' },
    { name: 'Razor Claw', speed: 4, glide: 2, turn: 0, fade: 3, type: 'Putter', brand: 'Discmania' },

    // Prodigy
    { name: 'PA-1', speed: 2, glide: 3, turn: 0, fade: 3, type: 'Putter', brand: 'Prodigy' },
    { name: 'PA-2', speed: 2, glide: 3, turn: 0, fade: 2, type: 'Putter', brand: 'Prodigy' },
    { name: 'PA-3', speed: 3, glide: 3, turn: 0, fade: 1, type: 'Putter', brand: 'Prodigy' },
    { name: 'PA-4', speed: 3, glide: 4, turn: -1, fade: 0, type: 'Putter', brand: 'Prodigy' },
    { name: 'PA-5', speed: 3, glide: 4, turn: -2, fade: 0, type: 'Putter', brand: 'Prodigy' },
    { name: 'A2', speed: 4, glide: 2, turn: 0, fade: 4, type: 'Putter', brand: 'Prodigy' },
    { name: 'A3', speed: 4, glide: 3, turn: 0, fade: 3, type: 'Putter', brand: 'Prodigy' },

    // Kastaplast
    { name: 'Berg', speed: 1, glide: 1, turn: 0, fade: 2, type: 'Putter', brand: 'Kastaplast' },
    { name: 'Reko', speed: 3, glide: 3, turn: 0, fade: 1, type: 'Putter', brand: 'Kastaplast' },
    { name: 'Reko X', speed: 3, glide: 3, turn: 0, fade: 2, type: 'Putter', brand: 'Kastaplast' },
    { name: 'K3 Reko', speed: 3, glide: 3, turn: 0, fade: 1, type: 'Putter', brand: 'Kastaplast' },

    // Streamline
    { name: 'Pilot', speed: 2, glide: 5, turn: 0, fade: 1, type: 'Putter', brand: 'Streamline' },
    { name: 'Stabilizer', speed: 3, glide: 3, turn: 0, fade: 3, type: 'Putter', brand: 'Streamline' },

    // DGA
    { name: 'Breaker', speed: 4, glide: 3, turn: 0, fade: 3, type: 'Putter', brand: 'DGA' },
    { name: 'Blowfly', speed: 2, glide: 3, turn: 0, fade: 0, type: 'Putter', brand: 'DGA' },

    // Gateway
    { name: 'Wizard', speed: 2, glide: 3, turn: 0, fade: 2, type: 'Putter', brand: 'Gateway' },
    { name: 'Warlock', speed: 2, glide: 3, turn: 0, fade: 1, type: 'Putter', brand: 'Gateway' },
    { name: 'Magic', speed: 2, glide: 5, turn: -2, fade: 0, type: 'Putter', brand: 'Gateway' },
    { name: 'Chief', speed: 2, glide: 4, turn: 0, fade: 1, type: 'Putter', brand: 'Gateway' },
];
