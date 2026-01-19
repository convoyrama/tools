// --- Physics Constants ---
export const PHYSICS = {
    GAME_DISTANCE: 800, // Reduced from 1000m to 800m to fit gearing perfectly
    IDLE_RPM: 600,
    MAX_RPM: 2500, 
    REDLINE_RPM: 2100, 
    WARNING_RPM: 1900, 
    OPTIMAL_MIN: 1400, 
    OPTIMAL_MAX: 1900, 
    
    ENGINE_BLOWOUT_TIME_MS: 500, 
    SHIFT_TIME_MS: 400, 
    SPEED_CONSTANT: 0.03, // Reduced for realism (Max ~150km/h)
    INERTIA: 1.0, 
};

// --- Gearbox Ratios (TUNED FOR 800m) ---
export const GEARBOXES = {
    '10': { name: 'Deprecated', description: '', ratios: [] },
    '12': {
        name: '12-Speed Heavy',
        description: 'Realistic heavy haul.',
        ratios: [
            6.00, // 1st
            4.50, // 2nd
            3.50, // 3rd
            2.80, // 4th
            2.30, // 5th
            1.90, // 6th
            1.60, // 7th
            1.30, // 8th
            1.00, // 9th  
            0.75, // 10th 
            0.55, // 11th 
            0.40  // 12th - Keeps same ratio but track is shorter
        ]
    },
    '18': { name: 'Deprecated', description: '', ratios: [] }
};

// --- Game Credits & Attribution ---
export const CREDITS = {
    music: {
        author: "GTDStudio aka Palrom",
        license: "OGA-BY 3.0",
        tracks: ["Dirby_day.mp3", "Doom.mp3", "Skirmish.mp3"],
        source: "OpenGameArt.org"
    },
    voice: {
        author: "Aimee Smith",
        website: "www.aimeesmithva.com",
        license: "CC-BY 4.0",
        source: "OpenGameArt.org"
    }
};
