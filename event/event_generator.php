<?php

// Set headers for PNG image output
header('Content-Type: image/png');
// We will set Content-Disposition later dynamically if a download is initiated by the client.
// For now, it will be displayed in the browser.

// Error reporting for development
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// --- Configuration ---
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const GAME_TIME_ANCHOR_UTC_MINUTES = 20 * 60 + 40; // 20:40 UTC
const TIME_SCALE = 6; // Game time is 6x faster
const FONT_PATH = __DIR__ . '/fonts/Arial-Bold.ttf'; // Ensure this font file exists
const CIRCLE_IMAGE_SIZE = 120;
const CIRCLE_IMAGE_PADDING = 20; // Padding from top/bottom and sides
const WAYPOINT_IMAGE_SIZE = 80;

// --- Timezone Data (from config.js) ---
const TIMEZONE_REGIONS = [
    "america" => [
        "name" => "region_america",
        "zones" => [
            [ "key" => "tz_america_argentina_buenos_aires", "iana_tz" => "America/Argentina/Buenos_Aires" ],
            [ "key" => "tz_america_argentina_cordoba", "iana_tz" => "America/Argentina/Cordoba" ],
            [ "key" => "tz_america_chihuahua", "iana_tz" => "America/Chihuahua" ],
            [ "key" => "tz_america_mexico_city", "iana_tz" => "America/Mexico_City" ],
            [ "key" => "tz_america_new_york", "iana_tz" => "America/New_York" ],
            [ "key" => "tz_america_sao_paulo", "iana_tz" => "America/Sao_Paulo" ],
            [ "key" => "tz_america_santiago", "iana_tz" => "America/Santiago" ]
        ]
    ],
    "europe" => [
        "name" => "region_europe",
        "zones" => [
            [ "key" => "tz_europe_berlin", "iana_tz" => "Europe/Berlin" ],
            [ "key" => "tz_europe_london", "iana_tz" => "Europe/London" ],
            [ "key" => "tz_europe_madrid", "iana_tz" => "Europe/Madrid" ],
            [ "key" => "tz_europe_moscow", "iana_tz" => "Europe/Moscow" ],
            [ "key" => "tz_europe_paris", "iana_tz" => "Europe/Paris" ]
        ]
    ],
    "asia" => [
        "name" => "region_asia",
        "zones" => [
            [ "key" => "tz_asia_dubai", "iana_tz" => "Asia/Dubai" ],
            [ "key" => "tz_asia_hong_kong", "iana_tz" => "Asia/Hong_Kong" ],
            [ "key" => "tz_asia_tokyo", "iana_tz" => "Asia/Tokyo" ]
        ]
    ],
    "australia" => [
        "name" => "region_australia",
        "zones" => [
            [ "key" => "tz_australia_sydney", "iana_tz" => "Australia/Sydney" ]
        ]
    ]
];

const TIMEZONE_COUNTRY_CODES = [
    "tz_america_argentina_buenos_aires" => ["AR"],
    "tz_america_argentina_cordoba" => ["AR"],
    "tz_america_chihuahua" => ["MX"],
    "tz_america_mexico_city" => ["MX"],
    "tz_america_new_york" => ["US"],
    "tz_america_sao_paulo" => ["BR"],
    "tz_america_santiago" => ["CL"],
    "tz_europe_berlin" => ["DE"],
    "tz_europe_london" => ["UK"],
    "tz_europe_madrid" => ["ES"],
    "tz_europe_moscow" => ["RU"],
    "tz_europe_paris" => ["FR"],
    "tz_asia_dubai" => ["AE"],
    "tz_asia_hong_kong" => ["HK"],
    "tz_asia_tokyo" => ["JP"],
    "tz_australia_sydney" => ["AU"]
];


// --- Utility Functions ---

/**
 * Calculates in-game time based on real-world UTC DateTime.
 * @param DateTimeImmutable $realWorldUtcDateTime
 * @return array {hours: int, minutes: int}
 */
function getGameTime(DateTimeImmutable $realWorldUtcDateTime): array {
    $realWorldUtcMinutes = (int)$realWorldUtcDateTime->format('H') * 60 + (int)$realWorldUtcDateTime->format('i');
    $differenceInMinutes = ($realWorldUtcMinutes - GAME_TIME_ANCHOR_UTC_MINUTES + 1440) % 1440;
    $gameTimeMinutes = ($differenceInMinutes * TIME_SCALE) % 1440;

    $gameHours = floor($gameTimeMinutes / 60);
    $gameMinutes = floor($gameTimeMinutes % 60);

    return ['hours' => (int)$gameHours, 'minutes' => (int)$gameMinutes];
}

/**
 * Formats time to HH:MM.
 * @param array $time {hours: int, minutes: int}
 * @return string
 */
function formatTime(array $time): string {
    return sprintf('%02d:%02d', $time['hours'], $time['minutes']);
}

/**
 * Safely loads an image from an uploaded file.
 * @param array $fileData Data from $_FILES.
 * @return GdImage|false Returns the GD image resource on success, false on failure.
 */
function loadImageFromFile(array $fileData): GdImage|false {
    if (!isset($fileData['tmp_name']) || !file_exists($fileData['tmp_name'])) {
        return false;
    }
    $mime = mime_content_type($fileData['tmp_name']);
    switch ($mime) {
        case 'image/jpeg':
            return imagecreatefromjpeg($fileData['tmp_name']);
        case 'image/png':
            return imagecreatefrompng($fileData['tmp_name']);
        case 'image/gif':
            return imagecreatefromgif($fileData['tmp_name']);
        default:
            return false;
    }
}

/**
 * Wraps text to fit within a specified width using imagettfbbox.
 * @param int $fontSize The font size.
 * @param string $fontPath The path to the font file.
 * @param string $text The text to wrap.
 * @param int $maxWidth The maximum width for the text.
 * @return array An array of wrapped lines.
 */
function wrapText(int $fontSize, string $fontPath, string $text, int $maxWidth): array {
    $lines = [];
    $words = explode(' ', $text);
    $currentLine = '';

    foreach ($words as $word) {
        $testLine = $currentLine . ($currentLine === '' ? '' : ' ') . $word;
        $testBox = imagettfbbox($fontSize, 0, $fontPath, $testLine);
        $testWidth = $testBox[2] - $testBox[0];

        if ($testWidth > $maxWidth && $currentLine !== '') {
            $lines[] = $currentLine;
            $currentLine = $word;
        } else {
            $currentLine = $testLine;
        }
    }
    if ($currentLine !== '') {
        $lines[] = $currentLine;
    }
    return $lines;
}

/**
 * Applies a circular mask to a GD image.
 * @param GdImage $srcImage The source image to mask.
 * @param int $size The diameter of the circle. The image will be resized to this square size.
 * @return GdImage Returns the masked image on success, or the original image if masking fails.
 */
function applyCircleMask(GdImage $srcImage, int $size): GdImage {
    $width = imagesx($srcImage);
    $height = imagesy($srcImage);

    // Create a new true color image for the resized and masked image
    $destImage = imagecreatetruecolor($size, $size);
    imagesavealpha($destImage, true);
    $transparent = imagecolorallocatealpha($destImage, 0, 0, 0, 127);
    imagefill($destImage, 0, 0, $transparent);

    // Resize and copy the source image to the destination image
    imagecopyresampled($destImage, $srcImage, 0, 0, 0, 0, $size, $size, $width, $height);

    // Create a mask
    $mask = imagecreatetruecolor($size, $size);
    $maskTransparent = imagecolorallocate($mask, 0, 0, 0);
    $maskOpaque = imagecolorallocate($mask, 255, 255, 255);
    imagefill($mask, 0, 0, $maskTransparent);

    // Draw a white circle on the mask
    imagefilledellipse($mask, $size / 2, $size / 2, $size, $size, $maskOpaque);

    // Apply the mask to the destination image
    imagecopymerge($destImage, $mask, 0, 0, 0, 0, $size, $size, 100);
    imagecolortransparent($destImage, $maskTransparent); // Make the black of the mask transparent

    imagedestroy($mask);
    return $destImage;
}

/**
 * Embeds a tEXt chunk into a PNG image data string.
 * This function is a simplified implementation and assumes a valid PNG structure.
 * It inserts the tEXt chunk before the IEND chunk.
 *
 * @param string $pngData The binary content of the PNG image.
 * @param string $keyword The keyword for the tEXt chunk (e.g., "Software").
 * @param string $text The text content for the tEXt chunk.
 * @return string The modified PNG data with the tEXt chunk embedded.
 */
function embedPngTextChunk(string $pngData, string $keyword, string $text): string {
    // PNG signature (8 bytes)
    $pngSignature = "\x89PNG\x0d\x0a\x1a\x0a";

    // Create the tEXt chunk data
    $chunkData = $keyword . "\0" . $text;
    $chunkType = "tEXt";
    $chunkLength = strlen($chunkData);

    // Pack length and type
    $packedLength = pack("N", $chunkLength);
    $packedType = $chunkType;

    // Calculate CRC (Cyclic Redundancy Check) for type and data
    $crc = pack("N", crc32($packedType . $chunkData));

    // Combine to form the tEXt chunk
    $tEXtChunk = $packedLength . $packedType . $chunkData . $crc;

    // Find the IEND chunk position
    $iendPos = strpos($pngData, pack("N", 0) . "IEND");
    if ($iendPos === false) {
        // IEND chunk not found, return original data or throw error
        return $pngData;
    }

    // Insert the tEXt chunk before the IEND chunk
    $modifiedPngData = substr($pngData, 0, $iendPos) . $tEXtChunk . substr($pngData, $iendPos);

    return $modifiedPngData;
}


// --- Main Image Generation Logic ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Check for font file existence
    if (!file_exists(FONT_PATH)) {
        http_response_code(500);
        die(getBackendTranslation('error_font_not_found', ['font_path' => FONT_PATH]));
    }

    // --- Extracting Data ---
    $eventName = $_POST['eventName'] ?? getBackendTranslation('default_event_name');
    $server = $_POST['server'] ?? getBackendTranslation('default_server');
    $startPlace = $_POST['startPlace'] ?? getBackendTranslation('default_start_place');
    $destination = $_POST['destination'] ?? getBackendTranslation('default_destination');
    $description = $_POST['description'] ?? getBackendTranslation('default_description');
    $waypointText = $_POST['waypointText'] ?? getBackendTranslation('default_waypoint_text');
    $customDate = $_POST['customDate'] ?? (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d');
    $customTime = $_POST['customTime'] ?? (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('H:i');
    $departureOffsetMinutes = (int)($_POST['departureOffsetMinutes'] ?? 15);
    $selectedRegion = $_POST['selectedRegion'] ?? 'UTC'; // IANA TZ or 'UTC'
    $manualOffset = $_POST['manualOffset'] ?? 'auto';
    $isWaypointVisible = filter_var($_POST['isWaypointVisible'] ?? 'false', FILTER_VALIDATE_BOOLEAN);

    // Image files (extracted from $_FILES)
    $circleImageTopFile = $_FILES['circleImageTop'] ?? null;
    $circleImageBottomFile = $_FILES['circleImageBottom'] ?? null;
    $waypointImageFile = $_FILES['waypointImage'] ?? null;
    $detailImageFile = $_FILES['detailImage'] ?? null; // New: Detail image file

    // Text styling (simplified to constants for now, will be dynamic later)
    $textSize = 25; // Fixed for now, will receive from frontend
    $textStyle = 'classic'; // Fixed for now, will receive from frontend
    $textBackgroundOpacity = 0.15; // Fixed for now, will receive from frontend

    // --- Time Calculations ---
    $meetingDateTime = null;
    $timezone = new DateTimeZone('UTC'); // Default to UTC for calculations

    try {
        if ($manualOffset === 'auto') {
            // Attempt to use selected IANA timezone, fallback to UTC
            $tz = new DateTimeZone($selectedRegion);
            $meetingDateTime = new DateTimeImmutable("{$customDate}T{$customTime}:00", $tz);
        } else {
            // Apply manual offset to UTC
            $offsetHours = (int)$manualOffset;
            $offsetString = sprintf('%+03d:00', $offsetHours);
            $meetingDateTime = new DateTimeImmutable("{$customDate}T{$customTime}:00{$offsetString}");
            $meetingDateTime = $meetingDateTime->setTimezone($timezone); // Convert to UTC
        }
    } catch (Exception $e) {
        // Fallback for invalid timezone or date/time
        $meetingDateTime = new DateTimeImmutable('now', $timezone);
    }

    $departureDateTime = $meetingDateTime->add(new DateInterval('PT' . $departureOffsetMinutes . 'M'));
    $arrivalDateTime = $departureDateTime->add(new DateInterval('PT50M')); // Assuming 50 minutes travel time from main.js

    $meetingGameTime = getGameTime($meetingDateTime);
    $departureGameTime = getGameTime($departureDateTime);
    $arrivalGameTime = getGameTime($arrivalDateTime);

    // --- Image Creation (Using GD library) ---
    $image = imagecreatetruecolor(CANVAS_WIDTH, CANVAS_HEIGHT);
    imagesavealpha($image, true); // Enable alpha blending

    // Define RGB color arrays for all styles
    $colors = [
        'black' => [0, 0, 0],
        'white' => [255, 255, 255],
        'discordDarkGray' => [54, 57, 63],
        'lightGray' => [220, 221, 222],
        'mint_green' => [90, 165, 25],
        'sky_blue' => [0, 255, 255],
        'bubblegum_pink' => [255, 0, 255],
        'red' => [255, 0, 0],
        'light_gray_240' => [240, 240, 240], // For inverse style
        'orange' => [255, 165, 0],
        'yellow' => [255, 255, 0],
        'light_blue_ice' => [176, 224, 230], // For ice style
        'hot_pink' => [255, 105, 180], // For retro style
        'pink_womens_day' => [255, 192, 203], // For womens_day and love style
        'gold' => [255, 215, 0],
        'hacker_green' => [0, 255, 0],
        'blue_violet' => [138, 43, 226], // For galaxy style
        'dark_red' => [139, 0, 0], // For sunset style shadow
        'neon_green' => [57, 255, 20],
        'light_green_jungle' => [144, 238, 144],
        'dark_green_jungle' => [0, 100, 0],
        'deep_sky_blue' => [0, 191, 255], // For oceanic style
        'silver' => [192, 192, 192], // For metallic style
        'lawn_green' => [124, 252, 0], // For toxic style
        'green_yellow' => [173, 255, 47], // For toxic style shadow
        'dark_slate_blue' => [72, 61, 139], // For cosmic style
    ];

    // Allocate all colors used in styles once
    $gdColors = [];
    foreach ($colors as $colorName => $rgb) {
        $gdColors[$colorName] = imagecolorallocate($image, $rgb[0], $rgb[1], $rgb[2]);
    }

    // Allocate alpha colors separately if needed, as imagecolorallocatealpha needs to be called after imagecreatetruecolor
    $gdColors['black_alpha_50'] = imagecolorallocatealpha($image, 0, 0, 0, 50); // Default shadow rgba(0,0,0,0.8) -> alpha 50 (out of 127)
    $gdColors['black_alpha_127'] = imagecolorallocatealpha($image, 0, 0, 0, 127); // Fully transparent or no shadow

    $transparency = imagecolorallocatealpha($image, 0, 0, 0, 127); // Fully transparent
    imagefill($image, 0, 0, $transparency);

    // Initial allocations (used outside of specific text styles)
    $black = $gdColors['black'];
    $white = $gdColors['white'];
    $discordDarkGray = $gdColors['discordDarkGray'];
    $lightGray = $gdColors['lightGray'];

    // --- Load and Draw Background Image ---
    $backgroundImage = null;
    if (isset($_FILES['backgroundImage']) && $_FILES['backgroundImage']['error'] === UPLOAD_ERR_OK) {
        $backgroundImage = loadImageFromFile($_FILES['backgroundImage']);
    }
    if ($backgroundImage) {
        imagecopyresampled($image, $backgroundImage, 0, 0, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, imagesx($backgroundImage), imagesy($backgroundImage));
        imagedestroy($backgroundImage);
    } else {
        imagefill($image, 0, 0, $discordDarkGray); // Fallback solid background
    }

    // --- Load and Draw Map Image ---
    $mapImage = null;
    if (isset($_FILES['mapImage']) && $_FILES['mapImage']['error'] === UPLOAD_ERR_OK) {
        $mapImage = loadImageFromFile($_FILES['mapImage']);
    }
    if ($mapImage) {
        // For simplicity, center the map image initially. No scaling/positioning from frontend yet.
        $mapX = (CANVAS_WIDTH - imagesx($mapImage)) / 2;
        $mapY = (CANVAS_HEIGHT - imagesy($mapImage)) / 2;
        imagecopy($image, $mapImage, $mapX, $mapY, 0, 0, imagesx($mapImage), imagesy($mapImage));
        imagedestroy($mapImage);
    }

    // --- Draw Event Name ---
    $eventNameFontSize = $textSize + 10;
    $textFillColor = $lightGray;
    $textBgAlpha = (int)((1 - $textBackgroundOpacity) * 127);
    $textBgColor = imagecolorallocatealpha($image, 0, 0, 0, $textBgAlpha);

    // Calculate text box for event name
    $eventNameBox = imagettfbbox($eventNameFontSize, 0, FONT_PATH, $eventName);
    $eventNameWidth = $eventNameBox[2] - $eventNameBox[0];
    $eventNameHeight = abs($eventNameBox[7] - $eventNameBox[1]);
    
    $eventNameX = (CANVAS_WIDTH - $eventNameWidth) / 2;
    $eventNameY = 30 + $eventNameHeight + 10; // Position below top edge, adjusted for baseline

    // Draw background rectangle for event name
    $rectWidth = $eventNameWidth + 40;
    $rectHeight = $eventNameHeight + 20;
    $rectX = (CANVAS_WIDTH - $rectWidth) / 2;
    $rectY = 30;
    imagefilledrectangle($image, $rectX, $rectY, $rectX + $rectWidth, $rectY + $rectHeight, $textBgColor);
    
    // Draw event name text
    imagettftext($image, $eventNameFontSize, 0, $eventNameX, $eventNameY, $textFillColor, FONT_PATH, $eventName);

    // --- Load and Draw Logo Image ---
    $logoImage = null;
    if (isset($_FILES['logoImage']) && $_FILES['logoImage']['error'] === UPLOAD_ERR_OK) {
        $logoImage = loadImageFromFile($_FILES['logoImage']);
    }
    $logoYOffset = $eventNameY + 30; // Default position if no logo
    if ($logoImage) {
        $logoHeight = 100;
        $logoWidth = (imagesx($logoImage) / imagesy($logoImage)) * $logoHeight;
        $logoX = (CANVAS_WIDTH - $logoWidth) / 2;
        $logoY = $eventNameY + 30; // Position below event name
        imagecopyresampled($image, $logoImage, $logoX, $logoY, 0, 0, $logoWidth, $logoHeight, imagesx($logoImage), imagesy($logoImage));
        imagedestroy($logoImage);
        $logoYOffset = $logoY + $logoHeight + 30; // Update offset if logo was drawn
    }

    // --- Load and Draw Circular Images ---
    $circleImageTop = null;
    $circleImageBottom = null;
    $waypointImage = null;

    if ($circleImageTopFile && $circleImageTopFile['error'] === UPLOAD_ERR_OK) {
        $img = loadImageFromFile($circleImageTopFile);
        if ($img) {
            $circleImageTop = applyCircleMask($img, CIRCLE_IMAGE_SIZE);
            imagedestroy($img);
        }
    }
    if ($circleImageBottomFile && $circleImageBottomFile['error'] === UPLOAD_ERR_OK) {
        $img = loadImageFromFile($circleImageBottomFile);
        if ($img) {
            $circleImageBottom = applyCircleMask($img, CIRCLE_IMAGE_SIZE);
            imagedestroy($img);
        }
    }
    if ($waypointImageFile && $waypointImageFile['error'] === UPLOAD_ERR_OK) {
        $img = loadImageFromFile($waypointImageFile);
        if ($img) {
            $waypointImage = applyCircleMask($img, WAYPOINT_IMAGE_SIZE);
            imagedestroy($img);
        }
    }

    // Draw circle images
    if ($circleImageTop) {
        imagecopy($image, $circleImageTop, CANVAS_WIDTH - CIRCLE_IMAGE_SIZE - CIRCLE_IMAGE_PADDING, CIRCLE_IMAGE_PADDING, 0, 0, CIRCLE_IMAGE_SIZE, CIRCLE_IMAGE_SIZE);
        imagedestroy($circleImageTop);
    }
    if ($circleImageBottom) {
        imagecopy($image, $circleImageBottom, CANVAS_WIDTH - CIRCLE_IMAGE_SIZE - CIRCLE_IMAGE_PADDING, CANVAS_HEIGHT - CIRCLE_IMAGE_SIZE - CIRCLE_IMAGE_PADDING, 0, 0, CIRCLE_IMAGE_SIZE, CIRCLE_IMAGE_SIZE);
        imagedestroy($circleImageBottom);
    }
    if ($waypointImage && $isWaypointVisible) {
        // Position Waypoint Image (example: center of the main content area)
        $waypointX = CANVAS_WIDTH / 2 - WAYPOINT_IMAGE_SIZE / 2;
        $waypointY = CANVAS_HEIGHT / 2 - WAYPOINT_IMAGE_SIZE / 2;
        imagecopy($image, $waypointImage, $waypointX, $waypointY, 0, 0, WAYPOINT_IMAGE_SIZE, WAYPOINT_IMAGE_SIZE);
        imagedestroy($waypointImage);
    }

    // Draw text labels for circular images
    $labelFontSize = 20;
    // Top Right Label ("Partida" / Departure)
    if ($circleImageTop) {
        $labelX = CANVAS_WIDTH - CIRCLE_IMAGE_SIZE - CIRCLE_IMAGE_PADDING - 100; // Adjust X position
        $labelY = CIRCLE_IMAGE_PADDING + CIRCLE_IMAGE_SIZE / 2 + $labelFontSize / 2; // Center vertically
        imagettftext($image, $labelFontSize, 0, $labelX, $labelY, $textFillColor, FONT_PATH, getBackendTranslation('canvas_departure'));
    }

    // Bottom Right Label ("Destino" / Destination)
    if ($circleImageBottom) {
        $labelX = CANVAS_WIDTH - CIRCLE_IMAGE_SIZE - CIRCLE_IMAGE_PADDING - 100; // Adjust X position
        $labelY = CANVAS_HEIGHT - CIRCLE_IMAGE_SIZE - CIRCLE_IMAGE_PADDING + CIRCLE_IMAGE_SIZE / 2 + $labelFontSize / 2; // Center vertically
        imagettftext($image, $labelFontSize, 0, $labelX, $labelY, $textFillColor, FONT_PATH, getBackendTranslation('canvas_destination'));
    }

    // Waypoint Label
    if ($waypointImage && $isWaypointVisible) {
        // Position Waypoint Image (example: center of the main content area)
        $waypointLabelX = $waypointX + WAYPOINT_IMAGE_SIZE / 2 - (imagettfbbox($labelFontSize, 0, FONT_PATH, $waypointText)[2] - imagettfbbox($labelFontSize, 0, FONT_PATH, $waypointText)[0]) / 2;
        $waypointLabelY = $waypointY + WAYPOINT_IMAGE_SIZE + $labelFontSize + 5; // Below waypoint image
        imagettftext($image, $labelFontSize, 0, $waypointLabelX, $waypointLabelY, $textFillColor, FONT_PATH, $waypointText);
    }

    // --- Load and Draw Detail Image ---
    $detailImage = null;
    if ($detailImageFile && $detailImageFile['error'] === UPLOAD_ERR_OK) {
        $detailImage = loadImageFromFile($detailImageFile);
    }
    if ($detailImage) {
        // Position it on the right side, between the two circle images vertically
        $detailWidth = imagesx($detailImage);
        $detailHeight = imagesy($detailImage);

        // Adjust size if it's too large, maintaining aspect ratio
        $maxWidth = CANVAS_WIDTH / 2 - 50; // Max width to fill
        $maxHeight = CANVAS_HEIGHT - CIRCLE_IMAGE_PADDING * 2 - CIRCLE_IMAGE_SIZE - 20; // Max height in the available space

        $ratio = min($maxWidth / $detailWidth, $maxHeight / $detailHeight);
        $newWidth = $detailWidth * $ratio;
        $newHeight = $detailHeight * $ratio;

        $detailX = CANVAS_WIDTH - $newWidth - 20; // 20px padding from right
        $detailY = CIRCLE_IMAGE_PADDING + CIRCLE_IMAGE_SIZE + 10; // Below top circle image + 10px padding

        // Center vertically in the remaining space if smaller than maxHeight
        if ($newHeight < $maxHeight) {
            $detailY += ($maxHeight - $newHeight) / 2;
        }

        imagecopyresampled($image, $detailImage, $detailX, $detailY, 0, 0, $newWidth, $newHeight, $detailWidth, $detailHeight);
        imagedestroy($detailImage);
    }

    // Define translation helper for simplicity in backend for now
    function getBackendTranslation($key, $replacements = []) {
        // This would ideally load a JSON file based on the 'lang' parameter passed from frontend
        // For now, hardcode some common terms in Spanish
        $translations = [
            'canvas_server' => 'Servidor:',
            'canvas_departure' => 'Partida:',
            'canvas_destination' => 'Destino:',
            'canvas_meeting_time' => 'Hora de reunión / Hora de partida:',
            'canvas_description_title' => 'Descripción:',
            'error_font_not_found' => 'Archivo de fuente no encontrado: {font_path}',
            'default_event_name' => 'Evento Personalizado',
            'default_server' => 'Sin especificar',
            'default_start_place' => 'Sin especificar',
            'default_destination' => 'Sin especificar',
            'default_description' => 'Sin descripción',
            'default_waypoint_text' => 'Waypoint',
            'region_america' => 'América',
            'region_europe' => 'Europa',
            'region_asia' => 'Asia',
            'region_australia' => 'Australia',
            'tz_america_argentina_buenos_aires' => 'Argentina (Buenos Aires)',
            'tz_america_argentina_cordoba' => 'Argentina (Córdoba)',
            'tz_america_chihuahua' => 'Chihuahua',
            'tz_america_mexico_city' => 'Ciudad de México',
            'tz_america_new_york' => 'Nueva York',
            'tz_america_sao_paulo' => 'São Paulo',
            'tz_america_santiago' => 'Santiago',
            'tz_europe_berlin' => 'Berlín',
            'tz_europe_london' => 'Londres',
            'tz_europe_madrid' => 'Madrid',
            'tz_europe_moscow' => 'Moscú',
            'tz_europe_paris' => 'París',
            'tz_asia_dubai' => 'Dubái',
            'tz_asia_hong_kong' => 'Hong Kong',
            'tz_asia_tokyo' => 'Tokio',
            'tz_australia_sydney' => 'Sídney',
            // Add more as needed
        ];

        $text = $translations[$key] ?? $key; // Fallback to key if translation not found
        foreach ($replacements as $placeholder => $value) {
            $text = str_replace("{{$placeholder}}", $value, $text);
        }
        return $text;
    }

    // --- Main Text Block ---
    $mainTextFontSize = $textSize;
    $mainTextX = 20;
    $mainTextMaxWidth = CANVAS_WIDTH / 2 - $mainTextX; // Roughly half width for text block

    $textLines = [];
    $textLines[] = getBackendTranslation('canvas_server') . " " . $server;
    $textLines[] = getBackendTranslation('canvas_departure') . " " . $startPlace;
    $textLines[] = getBackendTranslation('canvas_destination') . " " . $destination;
    $textLines[] = ""; // Empty line for spacing
    $textLines[] = getBackendTranslation('canvas_meeting_time');

    // Timezone info
    $activeRegion = null;
    foreach (TIMEZONE_REGIONS as $regionKey => $regionData) {
        if ($regionKey === strtolower(explode('/', $selectedRegion)[0])) { // Simple check, e.g., America/Buenos_Aires -> america
            $activeRegion = $regionData;
            break;
        }
    }
    // Fallback to searching all zones if region not found, or directly if selectedRegion is an IANA TZ
    if (!$activeRegion) {
        foreach (TIMEZONE_REGIONS as $regionData) {
            foreach ($regionData['zones'] as $zone) {
                if ($zone['iana_tz'] === $selectedRegion) {
                    $activeRegion = $regionData;
                    break 2;
                }
            }
        }
    }


    $utcBaseTime = $meetingDateTime; // $meetingDateTime is already in UTC

    if ($activeRegion) {
        $datesByDay = [];
        foreach ($activeRegion['zones'] as $tzData) {
            try {
                $localTimeForTz = $utcBaseTime->setTimezone(new DateTimeZone($tzData['iana_tz']));
                $dayString = $localTimeForTz->format('d M'); // Format like 'dd MMM'
                
                if (!isset($datesByDay[$dayString])) {
                    $datesByDay[$dayString] = [];
                }

                $tzLabel = getBackendTranslation($tzData['key']);
                $reunionTime = $localTimeForTz->format('H:i');
                
                $departureTimeForTz = $localTimeForTz->add(new DateInterval('PT' . $departureOffsetMinutes . 'M'));
                $partidaTime = $departureTimeForTz->format('H:i');
                
                $datesByDay[$dayString][] = ['tzLabel' => $tzLabel, 'reunionTime' => $reunionTime, 'partidaTime' => $partidaTime];

            } catch (Exception $e) {
                // Handle invalid timezone, skip
            }
        }

        // Sort days (simple lexicographical for now, can be improved with full DateTime objects)
        ksort($datesByDay);

        foreach ($datesByDay as $dayString => $dayEntries) {
            $textLines[] = $dayString;
            foreach ($dayEntries as $timeEntry) {
                $textLines[] = "  {$timeEntry['tzLabel']}: {$timeEntry['reunionTime']} / {$timeEntry['partidaTime']}";
            }
        }
    } else {
        $textLines[] = "  N/A";
    }

    $textLines[] = ""; // Empty line for spacing
    $textLines[] = getBackendTranslation('canvas_description_title');
    $descriptionWrapped = wrapText($mainTextFontSize, FONT_PATH, $description, $mainTextMaxWidth);
    $textLines = array_merge($textLines, $descriptionWrapped);


    $topOffset = ($logoImage) ? ($logoY + $logoHeight + 30) : ($eventNameY + 30); // Dynamic top offset based on whether logo is present
    $currentTextY = $topOffset + $mainTextFontSize + 15; // Starting Y for text block

    $lineHeight = $mainTextFontSize + 15;

    // Calculate bounding box for the entire text block for background rectangle
    $textBlockMaxLineWidth = 0;
    $textBlockHeight = 0;

    foreach ($textLines as $line) {
        $lineWrapped = wrapText($mainTextFontSize, FONT_PATH, $line, $mainTextMaxWidth); // Re-wrap for accurate width
        foreach ($lineWrapped as $wrappedLine) {
            $lineBox = imagettfbbox($mainTextFontSize, 0, FONT_PATH, $wrappedLine);
            $lineWidth = $lineBox[2] - $lineBox[0];
            if ($lineWidth > $textBlockMaxLineWidth) {
                $textBlockMaxLineWidth = $lineWidth;
            }
            $textBlockHeight += $lineHeight;
        }
    }

    // Draw background rectangle for the main text block
    $textRectWidth = $textBlockMaxLineWidth + 40; // Padding
    $textRectHeight = $textBlockHeight + 20; // Padding
    $textRectX = $mainTextX - 10;
    $textRectY = $topOffset + 15;
    imagefilledrectangle($image, $textRectX, $textRectY, $textRectX + $textRectWidth, $textRectY + $textRectHeight, $textBgColor);

    // Draw the main text block
    foreach ($textLines as $line) {
        $wrappedLines = wrapText($mainTextFontSize, FONT_PATH, $line, $mainTextMaxWidth);
        foreach ($wrappedLines as $wrappedLine) {
            $currentLineX = $mainTextX;
            if (str_starts_with($line, '  ')) { // Indent for timezone details
                $currentLineX += 15;
            }
            // Draw shadow
            imagettftext($image, $mainTextFontSize, 0, $currentLineX + 2, $currentTextY + 2, $shadowColor, FONT_PATH, $wrappedLine);
            // Draw main text
            imagettftext($image, $mainTextFontSize, 0, $currentLineX, $currentTextY, $textFillColor, FONT_PATH, $wrappedLine);
            $currentTextY += $lineHeight;
        }
    }

    // --- Implement Text Styling ---
    $textFillColor = $gdColors['lightGray'];
    $shadowColor = $gdColors['black_alpha_50']; // Default shadow rgba(0,0,0,0.8) -> alpha 50 (out of 127)
    $borderColor = $gdColors['white'];
    $shadowBlur = 0; // GD doesn't have direct shadow blur

    switch ($textStyle) {
        case "classic":
            break;
        case "mint":
            $borderColor = $gdColors['mint_green'];
            $shadowColor = $gdColors['mint_green'];
            break;
        case "sky":
            $borderColor = $gdColors['sky_blue'];
            $shadowColor = $gdColors['sky_blue'];
            break;
        case "bubblegum":
            $borderColor = $gdColors['bubblegum_pink'];
            $shadowColor = $gdColors['bubblegum_pink'];
            break;
        case "alert":
            $borderColor = $gdColors['red'];
            $shadowColor = $gdColors['red'];
            break;
        case "inverse":
            $textFillColor = $gdColors['black'];
            $borderColor = $gdColors['light_gray_240'];
            $shadowColor = $gdColors['light_gray_240'];
            break;
        case "fire":
            $textFillColor = $gdColors['orange'];
            $borderColor = $gdColors['yellow'];
            break;
        case "ice":
            $textFillColor = $gdColors['light_blue_ice'];
            $borderColor = $gdColors['light_blue_ice'];
            break;
        case "retro":
            $textFillColor = $gdColors['hot_pink'];
            $borderColor = $gdColors['hot_pink'];
            $shadowColor = $gdColors['sky_blue']; // Cyan is sky_blue in our palette
            break;
        case "womens_day":
            $textFillColor = $gdColors['pink_womens_day'];
            $borderColor = $gdColors['pink_womens_day'];
            break;
        case "gold":
            $textFillColor = $gdColors['gold'];
            $borderColor = $gdColors['gold'];
            break;
        case "rainbow":
            $textFillColor = $gdColors['red']; // Solid red for simplicity
            $borderColor = $gdColors['red'];
            break;
        case "hacker":
            $textFillColor = $gdColors['hacker_green'];
            $borderColor = $gdColors['hacker_green'];
            $shadowColor = $gdColors['black_alpha_127']; // No shadow (fully transparent)
            break;
        case "love":
            $textFillColor = $gdColors['pink_womens_day'];
            $borderColor = $gdColors['pink_womens_day'];
            break;
        case "galaxy":
            $textFillColor = $gdColors['white'];
            $shadowColor = $gdColors['blue_violet'];
            $borderColor = $gdColors['blue_violet'];
            break;
        case "sunset":
            $textFillColor = $gdColors['yellow'];
            $shadowColor = $gdColors['dark_red'];
            $borderColor = $gdColors['orange'];
            break;
        case "neon":
            $textFillColor = $gdColors['neon_green'];
            $shadowColor = $gdColors['neon_green'];
            $borderColor = $gdColors['neon_green'];
            $shadowBlur = 20; // Simulated blur
            break;
        case "jungle":
            $textFillColor = $gdColors['light_green_jungle'];
            $shadowColor = $gdColors['dark_green_jungle'];
            $borderColor = $gdColors['dark_green_jungle'];
            break;
        case "volcano":
            $textFillColor = $gdColors['orange'];
            $shadowColor = $gdColors['red'];
            $borderColor = $gdColors['red'];
            break;
        case "electric":
            $textFillColor = $gdColors['white'];
            $shadowColor = $gdColors['yellow'];
            $borderColor = $gdColors['yellow'];
            break;
        case "oceanic":
            $textFillColor = $gdColors['deep_sky_blue'];
            $borderColor = $gdColors['deep_sky_blue'];
            break;
        case "sunrise":
            $textFillColor = $gdColors['gold'];
            $borderColor = $gdColors['orange'];
            break;
        case "shadow":
            $textFillColor = $gdColors['white'];
            $shadowColor = $gdColors['black'];
            $shadowBlur = 15; // Simulated blur
            break;
        case "metallic":
            $textFillColor = $gdColors['silver'];
            $shadowColor = $gdColors['black'];
            $borderColor = $gdColors['silver'];
            break;
        case "toxic":
            $textFillColor = $gdColors['lawn_green'];
            $shadowColor = $gdColors['green_yellow'];
            $borderColor = $gdColors['lawn_green'];
            $shadowBlur = 20;
            break;
        case "cosmic":
            $textFillColor = $gdColors['white'];
            $shadowColor = $gdColors['dark_slate_blue'];
            $borderColor = $gdColors['dark_slate_blue'];
            break;
        case "sunburst":
            $textFillColor = $gdColors['gold'];
            $shadowColor = $gdColors['dark_red'];
            $borderColor = $gdColors['gold'];
            break;
    }
    // Draw event name shadow
    imagettftext($image, $eventNameFontSize, 0, $eventNameX + 2, $eventNameY + 2, $shadowColor, FONT_PATH, $eventName);
    // Draw event name text
    imagettftext($image, $eventNameFontSize, 0, $eventNameX, $eventNameY, $textFillColor, FONT_PATH, $eventName);
    // --- Collect Event Data for Embedding ---
    $eventDataForEmbed = [
        'eventName' => $eventName,
        'server' => $server,
        'startPlace' => $startPlace,
        'destination' => $destination,
        'description' => $description,
        'waypointText' => $waypointText,
        'customDate' => $customDate,
        'customTime' => $customTime,
        'departureOffsetMinutes' => $departureOffsetMinutes,
        'selectedRegion' => $selectedRegion,
        'manualOffset' => $manualOffset,
        'isWaypointVisible' => $isWaypointVisible,
        // Add any other relevant parameters from the frontend
        // For instance, style choices if they become dynamic:
        // 'textStyle' => $textStyle,
        // 'textSize' => $textSize,
    ];
    $eventJsonData = json_encode($eventDataForEmbed);

    // Capture PNG output
    ob_start();
    imagepng($image); // Output the image to the browser
    $pngData = ob_get_clean();

    // Embed the JSON data as a tEXt chunk
    $modifiedPngData = embedPngTextChunk($pngData, 'convoyrama-event-data', $eventJsonData);

    // Output the modified PNG data
    echo $modifiedPngData;

    imagedestroy($image); // Free up memory