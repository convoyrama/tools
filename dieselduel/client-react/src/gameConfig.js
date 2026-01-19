// --- Physics Constants ---
export const PHYSICS = {
    GAME_DISTANCE: 1000, 
    IDLE_RPM: 200, // Heavy chug-chug idle
    MAX_RPM: 2500, 
    REDLINE_RPM: 2100, 
    WARNING_RPM: 1900, 
    // Optimal zones are now per-gear!
    
    ENGINE_BLOWOUT_TIME_MS: 500, 
    SHIFT_TIME_MS: 400, 
    SPEED_CONSTANT: 0.03, 
    INERTIA: 1.0, 
};

// --- Gearbox Ratios (Mechanical Personality) ---
export const GEARBOXES = {
    '10': { name: 'Deprecated', description: '', ratios: [] },
    '12': {
        name: '12-Speed Organic',
        description: 'Variable shift points.',
        ratios: [
            // LOW GEARS: Needs HIGH RPM to move the weight (Torque heavy)
            { r: 6.00, min: 1600, max: 2100 }, // 1st: Scream it!
            { r: 4.50, min: 1600, max: 2000 }, // 2nd
            { r: 3.50, min: 1500, max: 1950 }, // 3rd
            { r: 2.80, min: 1500, max: 1900 }, // 4th
            
            // MID GEARS: Standard cruising range
            { r: 2.30, min: 1400, max: 1850 }, // 5th
            { r: 1.90, min: 1400, max: 1850 }, // 6th
            { r: 1.60, min: 1350, max: 1800 }, // 7th
            { r: 1.30, min: 1350, max: 1800 }, // 8th
            
            // HIGH GEARS: Sensitive overdrive. Shift EARLY or lose boost!
            { r: 1.00, min: 1200, max: 1600 }, // 9th: Smooth
            { r: 0.75, min: 1200, max: 1550 }, // 10th
            { r: 0.55, min: 1150, max: 1500 }, // 11th
            { r: 0.40, min: 1100, max: 1450 }  // 12th: Keep it low
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
    },
    background: {
        author: "CraftPix.net",
        source: "2D Game Assets",
        license: "OGA-BY 3.0"
    }
};
