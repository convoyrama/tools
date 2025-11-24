import { $, $$, loadTranslations, translate, applyTranslations, getGameTime, formatTime, getDetailedDayNightIcon, formatDateForDisplay, formatDateForDisplayShort } from '../common/js/utils.js';

console.log("event_generator_frontend.js loaded.");

// --- i18n Utility (page specific parts) ---
let currentLanguage = localStorage.getItem('selectedLanguage') || 'es'; // Default to Spanish

async function eventLoadTranslations(lang) {
    await loadTranslations(lang); // Call the common loadTranslations
    applyTranslations(); // Apply global translations
    document.title = translate('page_title'); // Page-specific title translation
    updateTimezoneRegionOptions(); // This is event-specific after translations
}

// --- Element References ---
const dom = {
    // Header
    navHome: $('a[data-i18n="nav_home"]'),
    navProfileCreator: $('a[data-i18n="nav_profile_creator"]'),
    navLicense: $('a[data-i18n="nav_license"]'),
    navCreateEvent: $('a[data-i18n="nav_create_event"]'),
    headerTitle: $('p[data-i18n="header_title"]'),

    // Warning
    warningMessage: $('.warning-message'),

    // Live Clocks
    localTimeDisplay: $('#local-time-display'),
    gameTimeDisplay: $('#game-time-display'),
    gameTimeEmoji: $('#game-time-emoji'),

    // Controls Bar
    langSelector: $('#lang-selector'),
    regionSelect: $('#region-select'),
    manualOffsetSelect: $('#manual-offset-select'),

    // Custom Event Section
    customDate: $('#custom-date'),
    customTime: $('#custom-time'),
    departureTimeOffset: $('#departure-time-offset'),
    ingameEmojiDisplay: $('#ingame-emoji-display'),
    customDateDisplay: $('#custom-date-display'),
    customEventName: $('#custom-event-name'),
    customEventLink: $('#custom-event-link'),
    customStartPlace: $('#custom-start-place'),
    customDestination: $('#custom-destination'),
    customServer: $('#custom-server'),
    customEventDescription: $('#custom-event-description'),

    // Image Uploads (referencing input elements directly, no longer image objects)
    mapUpload: $('#map-upload'),
    circleUploadTop: $('#circle-upload-top'),
    circleUploadBottom: $('#circle-upload-bottom'),
    logoUpload: $('#logo-upload'),
    backgroundUpload: $('#background-upload'),
    detailUpload: $('#detail-upload'),
    waypointUpload: $('#waypoint-upload'),
    waypointToggle: $('#waypoint-toggle'),

    // Image display container
    generatedFlyer: $('#generated-flyer'),
    generateImageButton: $('#generate-image'),
    statusMessage: $('#status-message'),
};

// --- Timezone Data (from config.js) ---
const timezoneRegions = {
    "america": {
        "name": "region_america",
        "zones": [
            { "key": "tz_america_argentina_buenos_aires", "iana_tz": "America/Argentina/Buenos_Aires" },
            { "key": "tz_america_argentina_cordoba", "iana_tz": "America/Argentina/Cordoba" },
            { "key": "tz_america_chihuahua", "iana_tz": "America/Chihuahua" },
            { "key": "tz_america_mexico_city", "iana_tz": "America/Mexico_City" },
            { "key": "tz_america_new_york", "iana_tz": "America/New_York" },
            { "key": "tz_america_sao_paulo", "iana_tz": "America/Sao_Paulo" },
            { "key": "tz_america_santiago", "iana_tz": "America/Santiago" }
        ]
    },
    "europe": {
        "name": "region_europe",
        "zones": [
            { "key": "tz_europe_berlin", "iana_tz": "Europe/Berlin" },
            { "key": "tz_europe_london", "iana_tz": "Europe/London" },
            { "key": "tz_europe_madrid", "iana_tz": "Europe/Madrid" },
            { "key": "tz_europe_moscow", "iana_tz": "Europe/Moscow" },
            { "key": "tz_europe_paris", "iana_tz": "Europe/Paris" }
        ]
    },
    "asia": {
        "name": "region_asia",
        "zones": [
            { "key": "tz_asia_dubai", "iana_tz": "Asia/Dubai" },
            { "key": "tz_asia_hong_kong", "iana_tz": "Asia/Hong_Kong" },
            { "key": "tz_asia_tokyo", "iana_tz": "Asia/Tokyo" }
        ]
    },
    "australia": {
        "name": "region_australia",
        "zones": [
            { "key": "tz_australia_sydney", "iana_tz": "Australia/Sydney" }
        ]
    }
};

// --- Timezone Country Codes (Simplified for i18n usage, should match locale keys) ---
const timezoneCountryCodes = {
    "tz_america_argentina_buenos_aires": ["AR"], // Using placeholder, actual names from language file
    "tz_america_argentina_cordoba": ["AR"],
    "tz_america_chihuahua": ["MX"],
    "tz_america_mexico_city": ["MX"],
    "tz_america_new_york": ["US"],
    "tz_america_sao_paulo": ["BR"],
    "tz_america_santiago": ["CL"],
    "tz_europe_berlin": ["DE"],
    "tz_europe_london": ["UK"],
    "tz_europe_madrid": ["ES"],
    "tz_europe_moscow": ["RU"],
    "tz_europe_paris": ["FR"],
    "tz_asia_dubai": ["AE"],
    "tz_asia_hong_kong": ["HK"],
    "tz_asia_tokyo": ["JP"],
    "tz_australia_sydney": ["AU"]
};

// --- Dynamic Content Updaters ---
function updateLiveClocks() {
    const now = luxon.DateTime.local();
    dom.localTimeDisplay.textContent = now.toFormat('HH:mm:ss');

    const gameNow = getGameTime(now.toUTC());
    dom.gameTimeDisplay.textContent = `${String(gameNow.hours).padStart(2, '0')}:${String(gameNow.minutes).padStart(2, '0')}`;
    dom.gameTimeEmoji.innerHTML = getDetailedDayNightIcon(gameNow.hours);
    twemoji.parse(dom.gameTimeEmoji);
}

function updateTimezoneRegionOptions() {
    dom.regionSelect.innerHTML = ''; // Clear existing options
    for (const regionKey in timezoneRegions) {
        const region = timezoneRegions[regionKey];
        const optgroup = document.createElement('optgroup');
        optgroup.label = translate(region.name); // Translate region name
        region.zones.forEach(tz => {
            const option = document.createElement('option');
            option.value = tz.iana_tz; // Use IANA TZ for option value
            option.textContent = translate(tz.key); // Translate zone key
            optgroup.appendChild(option);
        });
        dom.regionSelect.appendChild(optgroup);
    }
}

function updateInGameTimeEmojis() {
    const customDateValue = dom.customDate.value;
    const customTimeValue = dom.customTime.value;

    if (!customDateValue || !customTimeValue) {
        dom.ingameEmojiDisplay.innerHTML = '';
        return;
    }

    const selectedRegionValue = dom.regionSelect.value; // This will now be IANA TZ or 'auto'
    const manualOffset = dom.manualOffsetSelect.value;

    let zone = 'UTC'; 
    if (manualOffset === 'auto' && selectedRegionValue && selectedRegionValue !== 'auto') {
        zone = selectedRegionValue; // Use selected IANA TZ
    }

    let meetingDateTime;
    if (manualOffset === 'auto') {
        meetingDateTime = luxon.DateTime.fromISO(`${customDateValue}T${customTimeValue}:00`, { zone: zone });
    } else {
        const inputDateTime = `${customDateValue}T${customTimeValue}:00`;
        const offsetMinutes = parseInt(manualOffset, 10) * 60;
        meetingDateTime = luxon.DateTime.fromISO(inputDateTime, { zone: 'utc' }).plus({ minutes: -offsetMinutes });
    }


    if (!meetingDateTime.isValid) {
        console.error("Invalid meetingDateTime:", meetingDateTime.invalidExplanation);
        dom.ingameEmojiDisplay.innerHTML = '';
        return;
    }

    const meetingGameTime = getGameTime(meetingDateTime.toUTC());
    const meetingEmoji = getDetailedDayNightIcon(meetingGameTime.hours);

    const departureOffsetMinutes = parseInt(dom.departureTimeOffset.value, 10);
    const departureDateTime = meetingDateTime.plus({ minutes: departureOffsetMinutes });
    const departureGameTime = getGameTime(departureDateTime.toUTC());
    const departureEmoji = getDetailedDayNightIcon(departureGameTime.hours);

    const arrivalDateTime = departureDateTime.plus({ minutes: 50 }); // Assuming 50 minutes travel time
    const arrivalGameTime = getGameTime(arrivalDateTime.toUTC());
    const arrivalEmoji = getDetailedDayNightIcon(arrivalGameTime.hours);

    dom.ingameEmojiDisplay.innerHTML = `${meetingEmoji} ${departureEmoji} ${arrivalEmoji}`;
    twemoji.parse(dom.ingameEmojiDisplay);
}


// --- Main Function to Gather Data and Send to PHP ---
async function generateImage() {
    const formData = new FormData();
    
    // Append simple text fields
    formData.append('eventName', dom.customEventName.value);
    formData.append('server', dom.customServer.value);
    formData.append('startPlace', dom.customStartPlace.value);
    formData.append('destination', dom.customDestination.value);
    formData.append('description', dom.customEventDescription.value);
    formData.append('customDate', dom.customDate.value);
    formData.append('customTime', dom.customTime.value);
    formData.append('departureOffsetMinutes', dom.departureTimeOffset.value);
    formData.append('selectedRegion', dom.regionSelect.value); // IANA TZ
    formData.append('manualOffset', dom.manualOffsetSelect.value);
    formData.append('isWaypointVisible', dom.waypointToggle.checked ? 'true' : 'false');


    // Append image files
    if (dom.mapUpload.files[0]) formData.append('mapImage', dom.mapUpload.files[0]);
    if (dom.circleUploadTop.files[0]) formData.append('circleImageTop', dom.circleUploadTop.files[0]);
    if (dom.circleUploadBottom.files[0]) formData.append('circleImageBottom', dom.circleUploadBottom.files[0]);
    if (dom.logoUpload.files[0]) formData.append('logoImage', dom.logoUpload.files[0]);
    if (dom.backgroundUpload.files[0]) formData.append('backgroundImage', dom.backgroundUpload.files[0]);
    if (dom.detailUpload.files[0]) formData.append('detailImage', dom.detailUpload.files[0]);
    if (dom.waypointUpload.files[0]) formData.append('waypointImage', dom.waypointUpload.files[0]);

    try {
        const response = await fetch('./event_generator.php', {
            method: 'POST',
            body: formData 
        });

        if (response.ok) {
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);
            dom.generatedFlyer.src = imageUrl;
            dom.statusMessage.textContent = translate('msg_image_generated_success');
            dom.statusMessage.style.color = '#43b581';
        } else {
            const errorText = await response.text();
            console.error('PHP Backend Error:', errorText);
            dom.statusMessage.textContent = translate('msg_error_generating_image') + errorText;
            dom.statusMessage.style.color = '#f04747';
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        dom.statusMessage.textContent = translate('msg_connection_error_php');
        dom.statusMessage.style.color = '#f04747';
    }
}


// --- Initial Setup ---
async function init() {
    twemoji.parse(document.body); // Initialize Twemoji

    // Initial language load and apply translations
    await eventLoadTranslations(currentLanguage);

    // Set initial date and time using Luxon
    const userNow = luxon.DateTime.local();
    dom.customDate.value = userNow.toISODate();
    dom.customTime.value = userNow.toFormat('HH:mm');
    dom.customDateDisplay.textContent = `${translate('label_selected_date')}: ${formatDateForDisplay(luxon.DateTime.fromISO(dom.customDate.value))}`;


    // Populate region select (and translate its options)
    updateTimezoneRegionOptions();
    // Select the current language in the dropdown
    dom.langSelector.querySelector(`[data-lang="${currentLanguage}"]`).classList.add('selected');


    updateLiveClocks(); 
    setInterval(updateLiveClocks, 1000); // Update live clocks every second
    updateInGameTimeEmojis();

    // Event Listeners
    dom.generateImageButton.addEventListener('click', generateImage);
    dom.customDate.addEventListener('input', () => {
        dom.customDateDisplay.textContent = `${translate('label_selected_date')}: ${formatDateForDisplay(luxon.DateTime.fromISO(dom.customDate.value))}`;
        updateInGameTimeEmojis();
    });
    dom.customTime.addEventListener('input', updateInGameTimeEmojis);
    dom.departureTimeOffset.addEventListener('change', updateInGameTimeEmojis);
    dom.regionSelect.addEventListener('change', updateInGameTimeEmojis);
    dom.manualOffsetSelect.addEventListener('change', updateInGameTimeEmojis);

    // Language selector event listener (flags)
    dom.langSelector.querySelectorAll(".flag-emoji").forEach(flag => {
        flag.addEventListener("click", async () => {
            const lang = flag.getAttribute("data-lang");
            await eventLoadTranslations(lang);
            dom.langSelector.querySelectorAll(".flag-emoji").forEach(f => f.classList.remove('selected'));
            flag.classList.add('selected');
            updateTimezoneRegionOptions(); // Re-populate with translated region names
            dom.customDateDisplay.textContent = `${translate('label_selected_date')}: ${formatDateForDisplay(luxon.DateTime.fromISO(dom.customDate.value))}`;
        });
    });
}

document.addEventListener('DOMContentLoaded', init);