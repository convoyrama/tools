// --- i18n Utility ---
let currentLanguage = localStorage.getItem('selectedLanguage') || 'es'; // Default to Spanish
let translations = {};

export async function loadTranslations(lang) {
    try {
        const response = await fetch(`../common/locales/${lang}.json`); // Centralized locales
        translations = await response.json();
        currentLanguage = lang;
        localStorage.setItem('selectedLanguage', lang);
    } catch (error) {
        console.error(`Error loading translations for ${lang}:`, error);
        // Fallback to default language if loading fails
        if (lang !== 'es') {
            await loadTranslations('es');
        } else {
            translations = {}; // No translations available
        }
    }
}

export function translate(key, replacements = {}) {
    let text = translations[key] || key; // Fallback to key if translation not found
    for (const placeholder in replacements) {
        text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    }
    return text;
}

export function applyTranslations() {
    // Translate title
    // document.title = translate('page_title'); // Removed: page-specific title should be handled in module

    // Translate elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = translate(key);
    });

    // Translate elements with data-i18n-title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        element.title = translate(key);
    });

    // Translate placeholders with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = translate(key);
    });

    // Translate specific options if needed (like "-- Nuevo Perfil --" in embed generator)
    document.querySelectorAll('select option[data-i18n]').forEach(option => {
        const key = option.getAttribute('data-i18n');
        option.textContent = translate(key);
    });
}

// --- DOM Utility Functions ---
export const $ = selector => document.querySelector(selector);
export const $$ = selector => document.querySelectorAll(selector);

// --- Time Utility Functions ---
export const GAME_TIME_ANCHOR_UTC_MINUTES = 20 * 60 + 40; // 20:40 UTC
export const TIME_SCALE = 6; // Game time is 6x faster

export function getGameTime(realWorldUtcDateTime) {
    if (!realWorldUtcDateTime || !realWorldUtcDateTime.isValid) { // Assuming luxon DateTime object
        return { hours: 0, minutes: 0 };
    }
    const realWorldUtcMinutes = realWorldUtcDateTime.hour * 60 + realWorldUtcDateTime.minute;
    const differenceInMinutes = (realWorldUtcMinutes - GAME_TIME_ANCHOR_UTC_MINUTES + 1440) % 1440;
    const gameTimeMinutes = (differenceInMinutes * TIME_SCALE) % 1440;

    const gameHours = Math.floor(gameTimeMinutes / 60);
    const gameMinutes = Math.floor(gameTimeMinutes % 60);

    return { hours: gameHours, minutes: gameMinutes };
}

export function formatTime(luxonDateTime) {
    return luxonDateTime.toFormat('HH:mm');
}

export function getDetailedDayNightIcon(hours) {
    if (hours >= 5 && hours < 7) return '🌅'; // Dawn
    if (hours >= 7 && hours < 19) return '☀️'; // Day
    if (hours >= 19 && hours < 21) return '🌇'; // Dusk
    return '🌙'; // Night
}

export function formatDateForDisplay(luxonDateTime) {
    return luxonDateTime.toFormat('dd/MM/yyyy');
}

export function formatDateForDisplayShort(luxonDateTime) {
    return luxonDateTime.toFormat('dd MMM');
}