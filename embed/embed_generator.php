<?php
header('Content-Type: application/json');

// !!! IMPORTANT: REPLACE WITH YOUR DISCORD BOT TOKEN !!!
// You can get this from your Discord Developer Portal -> Your Application -> Bot -> Token
define('DISCORD_BOT_TOKEN', 'YOUR_DISCORD_BOT_TOKEN_HERE'); 

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (isset($data['action']) && $data['action'] === 'send_embed') {
        $channelId = $data['channel_id'] ?? null;
        $embedData = $data['embed_data'] ?? null;

        if (empty($channelId) || empty($embedData)) {
            echo json_encode(['success' => false, 'message' => 'Faltan ID del canal o datos del embed.']);
            exit;
        }

        if (DISCORD_BOT_TOKEN === 'YOUR_DISCORD_BOT_TOKEN_HERE' || empty(DISCORD_BOT_TOKEN)) {
            echo json_encode(['success' => false, 'message' => 'El token del bot de Discord no está configurado en el servidor.']);
            exit;
        }

        $discordApiUrl = "https://discord.com/api/v10/channels/{$channelId}/messages";

        $ch = curl_init($discordApiUrl);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array(
            'Content-Type: application/json',
            'Authorization: Bot ' . DISCORD_BOT_TOKEN
        ));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($embedData));

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            echo json_encode(['success' => false, 'message' => 'Error de cURL: ' . $error]);
        } else {
            $responseData = json_decode($response, true);
            if ($httpCode >= 200 && $httpCode < 300) {
                echo json_encode(['success' => true, 'message' => 'Embed enviado exitosamente!', 'response' => $responseData]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Error al enviar embed a Discord.', 'status_code' => $httpCode, 'response' => $responseData]);
            }
        }
        exit;
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generador de Embeds para Discord</title>
    <style>
        body {
            font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            background-color: #36393f; /* Discord dark background */
            color: #dcddde; /* Discord text color */
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
            padding: 20px;
            box-sizing: border-box;
        }

        .app-container {
            display: flex;
            gap: 20px;
            width: 100%;
            max-width: 1400px;
            background-color: #2f3136; /* Discord lighter dark background */
            border-radius: 8px;
            box-shadow: 0 2px 10px 0 rgba(0,0,0,.2);
            overflow: hidden;
        }

        .controls {
            flex: 1;
            padding: 20px;
            background-color: #2f3136;
            border-right: 1px solid #202225;
            max-width: 50%;
            box-sizing: border-box;
        }

        .controls h2, .preview-area h2 {
            color: #fff;
            font-size: 24px;
            margin-top: 0;
            margin-bottom: 20px;
            border-bottom: 1px solid #4f545c;
            padding-bottom: 10px;
        }

        .control-group {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px dashed #4f545c;
        }
        .control-group:last-of-type {
            border-bottom: none;
        }

        .control-group h3 {
            color: #99aab5;
            font-size: 16px;
            margin-top: 0;
            margin-bottom: 10px;
        }

        input[type="text"],
        input[type="url"],
        textarea,
        input[type="color"] {
            width: calc(100% - 20px);
            padding: 10px;
            margin-bottom: 10px;
            border: 1px solid #202225;
            border-radius: 4px;
            background-color: #40444b;
            color: #dcddde;
            font-size: 14px;
            box-sizing: border-box;
        }
        input[type="color"] {
            height: 40px;
            padding: 0;
            cursor: pointer;
        }

        textarea {
            resize: vertical;
            min-height: 80px;
        }

        label {
            display: block;
            margin-bottom: 5px;
            color: #99aab5;
            font-size: 14px;
        }
        label input[type="checkbox"] {
            margin-right: 5px;
        }

        button {
            background-color: #7289da; /* Discord blue */
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.2s ease;
            margin-right: 10px;
        }
        button:hover {
            background-color: #677bc4;
        }
        button:active {
            background-color: #5b6eae;
        }

        .io-buttons button {
            width: calc(50% - 5px);
            margin-right: 0;
        }
        .io-buttons button:first-child {
            margin-right: 10px;
        }

        .field-item {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 10px;
            padding: 10px;
            background-color: #40444b;
            border-radius: 4px;
            border: 1px solid #202225;
        }
        .field-item input[type="text"] {
            flex: 1;
            margin-bottom: 0;
            width: auto;
        }
        .field-item .field-inline-checkbox {
            display: flex;
            align-items: center;
            width: 100%;
            justify-content: flex-end;
            margin-top: 5px;
        }
        .field-item .field-inline-checkbox label {
            margin-bottom: 0;
            display: flex;
            align-items: center;
            color: #dcddde;
        }
        .field-item .field-inline-checkbox input[type="checkbox"] {
            margin-left: 10px;
        }
        .field-item button {
            background-color: #f04747; /* Discord red */
            width: 30px;
            height: 30px;
            padding: 0;
            font-size: 18px;
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 0;
            border-radius: 50%;
        }
        .field-item button:hover {
            background-color: #cc3939;
        }

        /* Preview Area */
        .preview-area {
            flex: 1;
            padding: 20px;
            background-color: #36393f;
            overflow-y: auto;
            max-width: 50%;
            box-sizing: border-box;
        }
        .discord-mockup {
            background-color: #36393f; /* Main Discord chat background */
            padding: 10px;
            border-radius: 5px;
        }
        .discord-message {
            display: flex;
            margin-bottom: 10px;
        }
        .discord-avatar {
            width: 40px;
            height: 40px;
            background-color: #202225;
            border-radius: 50%;
            margin-right: 10px;
            flex-shrink: 0;
        }
        .discord-message-content {
            flex-grow: 1;
        }
        .discord-username {
            font-weight: bold;
            color: #fff;
            margin-bottom: 2px;
            font-size: 15px;
        }

        .discord-embed {
            display: flex;
            margin-top: 8px;
            max-width: 520px; /* Discord embed max width */
            border-radius: 4px;
            overflow: hidden;
            background-color: #2f3136; /* Embed background */
            border-left: 4px solid #7289da; /* Default embed color */
            position: relative;
            font-size: 13px;
            line-height: 18px;
        }
        .embed-sidebar {
            width: 4px;
            flex-shrink: 0;
        }
        .embed-content {
            padding: 8px 16px 8px 12px;
            flex-grow: 1;
        }
        .embed-author {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
            color: #fff;
            font-weight: 600;
        }
        .embed-author-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            margin-right: 8px;
            object-fit: cover;
        }
        .embed-author-name {
            color: #fff;
            text-decoration: none;
        }
        .embed-author-name:hover {
            text-decoration: underline;
        }

        .embed-title {
            color: #fff;
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 5px;
            display: block;
            text-decoration: none;
        }
        .embed-title:hover {
            text-decoration: underline;
        }

        .embed-description {
            color: #dcddde;
            margin-bottom: 10px;
            white-space: pre-wrap; /* Preserve newlines from markdown */
        }

        .embed-fields {
            display: flex;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        .embed-field {
            margin-bottom: 10px;
            flex-basis: 100%;
            font-size: 13px;
        }
        .embed-field.inline {
            flex-basis: calc(50% - 12px); /* Two fields per row with gap */
            margin-right: 24px;
        }
        .embed-field.inline:nth-child(2n) {
            margin-right: 0;
        }
        .embed-field h4 {
            color: #fff;
            font-weight: bold;
            margin: 0 0 2px 0;
        }
        .embed-field p {
            color: #dcddde;
            margin: 0;
            white-space: pre-wrap;
        }

        .embed-thumbnail {
            width: 80px; /* Adjust as needed */
            height: 80px;
            object-fit: contain;
            float: right;
            margin-left: 10px;
            margin-bottom: 10px;
        }
        .embed-thumbnail img {
            width: 100%;
            height: 100%;
            border-radius: 3px;
        }
        .embed-image {
            margin-top: 10px;
        }
        .embed-image img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
        }

        .embed-footer {
            display: flex;
            align-items: center;
            margin-top: 10px;
            color: #72767d;
            font-size: 12px;
        }
        .embed-footer-icon {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 8px;
            object-fit: cover;
        }
        .embed-footer-text {
            color: #72767d;
        }
        .embed-timestamp {
            color: #72767d;
        }
        .embed-footer-separator {
            content: ' ';
            width: 4px;
            height: 4px;
            background-color: #72767d;
            border-radius: 50%;
            margin: 0 5px;
            display: none; /* Only show if timestamp is present */
        }
        .embed-footer-text + .embed-footer-separator {
            display: block;
        }
        .main-actions {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        #status-message {
            margin: 0;
            font-size: 14px;
            font-weight: bold;
        }
        .io-buttons {
            display: flex;
            gap: 10px;
        }


    </style>
</head>
<body>
        <div class="app-container">
        <div class="controls">
            <h2>Panel de Control</h2>

            <div class="control-group">
                <h3>Destino</h3>
                <input type="text" id="channel-id" placeholder="ID del Canal de Discord">
            </div>

            <div class="control-group">
                <h3>Autor</h3>
                <input type="text" id="author-name" placeholder="Nombre del Autor">
                <input type="text" id="author-url" placeholder="URL del Autor">
                <input type="text" id="author-icon-url" placeholder="URL del Icono del Autor">
            </div>

            <div class="control-group">
                <h3>Embed Principal</h3>
                <input type="text" id="title" placeholder="Título">
                <input type="text" id="url" placeholder="URL del Título">
                <textarea id="description" placeholder="Descripción (acepta Markdown de Discord)"></textarea>
                <label for="color">Color de la Barra Lateral</label>
                <input type="color" id="color" value="#ffffff">
            </div>
            
            <div class="control-group">
                <h3>Campos (Fields)</h3>
                <div id="fields-container">
                    <!-- Dynamic fields will be added here -->
                </div>
                <button id="add-field">Añadir Campo</button>
            </div>

            <div class="control-group">
                <h3>Imágenes</h3>
                <input type="text" id="thumbnail-url" placeholder="URL de la Miniatura (Thumbnail)">
                <input type="text" id="image-url" placeholder="URL de la Imagen Principal">
            </div>

            <div class="control-group">
                <h3>Pie de Página (Footer)</h3>
                <input type="text" id="footer-text" placeholder="Texto del Pie de Página">
                <input type="text" id="footer-icon-url" placeholder="URL del Icono del Pie de Página">
                <label><input type="checkbox" id="timestamp"> Mostrar Marca de Tiempo</label>
            </div>

            <div class="control-group main-actions">
                <button id="send-embed">Enviar Embed</button>
                <p id="status-message"></p>
            </div>

            <div class="control-group-io">
                <h3>Guardar/Cargar Diseño</h3>
                <textarea id="io-code" placeholder="Pega un código para cargar un diseño..."></textarea>
                <div class="io-buttons">
                    <button id="get-code">Obtener Código para Guardar</button>
                    <button id="load-code">Cargar desde Código</button>
                </div>
            </div>
        </div>

        <div class="preview-area">
            <h2>Vista Previa</h2>
            <div class="discord-mockup">
                <div class="discord-message">
                    <div class="discord-avatar"></div>
                    <div class="discord-message-content">
                        <div class="discord-username">Tu Bot</div>
                        <div id="preview-embed" class="discord-embed">
                            <div class="embed-sidebar"></div>
                            <div class="embed-content">
                                <div class="embed-author">
                                    <img src="" class="embed-author-icon">
                                    <a href="#" target="_blank" class="embed-author-name"></a>
                                </div>
                                <a href="#" target="_blank" class="embed-title"></a>
                                <div class="embed-description"></div>
                                <div class="embed-fields"></div>
                                <div class="embed-image">
                                    <img src="">
                                </div>
                                <div class="embed-thumbnail">
                                    <img src="">
                                </div>
                                <div class="embed-footer">
                                    <img src="" class="embed-footer-icon">
                                    <span class="embed-footer-text"></span>
                                    <span class="embed-footer-separator"></span>
                                    <span class="embed-timestamp"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const $ = selector => document.querySelector(selector);
        const $$ = selector => document.querySelectorAll(selector);

        // Elements
        const formElements = {
            channelId: $('#channel-id'),
            authorName: $('#author-name'),
            authorUrl: $('#author-url'),
            authorIconUrl: $('#author-icon-url'),
            title: $('#title'),
            url: $('#url'),
            description: $('#description'),
            color: $('#color'),
            thumbnailUrl: $('#thumbnail-url'),
            imageUrl: $('#image-url'),
            footerText: $('#footer-text'),
            footerIconUrl: $('#footer-icon-url'),
            timestamp: $('#timestamp'),
            fieldsContainer: $('#fields-container'),
            addFieldBtn: $('#add-field'),
            sendEmbedBtn: $('#send-embed'),
            statusMessage: $('#status-message'),
            ioCode: $('#io-code'),
            getCodeBtn: $('#get-code'),
            loadCodeBtn: $('#load-code')
        };

        const previewElements = {
            embed: $('#preview-embed'),
            sidebar: $('.embed-sidebar'),
            author: $('.embed-author'),
            authorIcon: $('.embed-author-icon'),
            authorName: $('.embed-author-name'),
            title: $('.embed-title'),
            description: $('.embed-description'),
            fields: $('.embed-fields'),
            thumbnail: $('.embed-thumbnail'),
            thumbnailImg: $('.embed-thumbnail img'),
            image: $('.embed-image'),
            imageImg: $('.embed-image img'),
            footer: $('.embed-footer'),
            footerIcon: $('.embed-footer-icon'),
            footerText: $('.embed-footer-text'),
            footerSeparator: $('.embed-footer-separator'),
            timestamp: $('.embed-timestamp')
        };

        let fieldCounter = 0;

        // --- Utility Functions ---
        function isValidHttpUrl(string) {
            let url;
            try {
                url = new URL(string);
            } catch (_) {
                return false;
            }
            return url.protocol === "http:" || url.protocol === "https:";
        }

        function hexToDec(hex) {
            return parseInt(hex.replace(/^#/, ''), 16);
        }

        function escapeMarkdown(text) {
            // Basic escaping for Discord markdown to prevent accidental formatting
            return text
                .replace(/\\/g, '\\\\') // Escape backslashes first
                .replace(/([*_~`|>])/g, '\\$1'); // Escape Discord special characters
        }

        // --- Field Management ---
        function addField(name = '', value = '', inline = false) {
            fieldCounter++;
            const fieldId = `field-${fieldCounter}`;
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'field-item';
            fieldDiv.dataset.fieldId = fieldId;

            fieldDiv.innerHTML = `
                <input type="text" class="field-name" placeholder="Nombre del Campo" value="${escapeMarkdown(name)}">
                <input type="text" class="field-value" placeholder="Valor del Campo" value="${escapeMarkdown(value)}">
                <div class="field-inline-checkbox">
                    <label>En línea <input type="checkbox" class="field-inline" ${inline ? 'checked' : ''}></label>
                    <button class="remove-field">&times;</button>
                </div>
            `;

            formElements.fieldsContainer.appendChild(fieldDiv);

            fieldDiv.querySelector('.remove-field').addEventListener('click', () => {
                fieldDiv.remove();
                updatePreview();
            });

            fieldDiv.querySelectorAll('input').forEach(input => input.addEventListener('input', updatePreview));
            updatePreview();
        }

        // --- Preview Update ---
        function updatePreview() {
            const embed = getEmbedData(false); // Get raw embed data, not for Discord API

            // Reset preview
            previewElements.embed.style.display = 'none'; // Hide by default if no content

            // Author
            if (embed.author && embed.author.name) {
                previewElements.author.style.display = 'flex';
                previewElements.authorName.textContent = embed.author.name;
                previewElements.authorName.href = isValidHttpUrl(embed.author.url) ? embed.author.url : '#';
                previewElements.authorIcon.src = isValidHttpUrl(embed.author.icon_url) ? embed.author.icon_url : '';
                previewElements.authorIcon.style.display = isValidHttpUrl(embed.author.icon_url) ? 'block' : 'none';
            } else {
                previewElements.author.style.display = 'none';
            }

            // Title
            if (embed.title) {
                previewElements.title.textContent = embed.title;
                previewElements.title.href = isValidHttpUrl(embed.url) ? embed.url : '#';
                previewElements.title.style.display = 'block';
            } else {
                previewElements.title.style.display = 'none';
            }

            // Description
            if (embed.description) {
                previewElements.description.innerHTML = embed.description.replace(/\n/g, '<br>'); // Simple newline conversion for preview
                previewElements.description.style.display = 'block';
            } else {
                previewElements.description.style.display = 'none';
            }

            // Color
            if (embed.color) {
                const hexColor = '#' + embed.color.toString(16).padStart(6, '0');
                previewElements.sidebar.style.backgroundColor = hexColor;
            } else {
                previewElements.sidebar.style.backgroundColor = ''; // Default Discord color
            }

            // Fields
            previewElements.fields.innerHTML = '';
            if (embed.fields && embed.fields.length > 0) {
                embed.fields.forEach(field => {
                    const fieldDiv = document.createElement('div');
                    fieldDiv.className = `embed-field ${field.inline ? 'inline' : ''}`;
                    fieldDiv.innerHTML = `<h4>${field.name}</h4><p>${field.value.replace(/\n/g, '<br>')}</p>`;
                    previewElements.fields.appendChild(fieldDiv);
                });
                previewElements.fields.style.display = 'flex';
            } else {
                previewElements.fields.style.display = 'none';
            }

            // Thumbnail
            if (embed.thumbnail && isValidHttpUrl(embed.thumbnail.url)) {
                previewElements.thumbnailImg.src = embed.thumbnail.url;
                previewElements.thumbnail.style.display = 'block';
            } else {
                previewElements.thumbnail.style.display = 'none';
                previewElements.thumbnailImg.src = '';
            }

            // Image
            if (embed.image && isValidHttpUrl(embed.image.url)) {
                previewElements.imageImg.src = embed.image.url;
                previewElements.image.style.display = 'block';
            } else {
                previewElements.image.style.display = 'none';
                previewElements.imageImg.src = '';
            }

            // Footer
            const hasFooterText = embed.footer && embed.footer.text;
            const hasFooterIcon = embed.footer && isValidHttpUrl(embed.footer.icon_url);
            const hasTimestamp = embed.timestamp;

            if (hasFooterText || hasFooterIcon || hasTimestamp) {
                previewElements.footer.style.display = 'flex';
                previewElements.footerText.textContent = hasFooterText ? embed.footer.text : '';
                previewElements.footerIcon.src = hasFooterIcon ? embed.footer.icon_url : '';
                previewElements.footerIcon.style.display = hasFooterIcon ? 'block' : 'none';

                if (hasTimestamp) {
                    previewElements.timestamp.textContent = new Date().toLocaleString('es-ES', {hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'});
                    previewElements.timestamp.style.display = 'block';
                } else {
                    previewElements.timestamp.style.display = 'none';
                }

                if (hasFooterText && hasTimestamp) {
                    previewElements.footerSeparator.style.display = 'block';
                } else {
                    previewElements.footerSeparator.style.display = 'none';
                }

            } else {
                previewElements.footer.style.display = 'none';
            }


            // Show embed if any content exists
            const hasContent = embed.author || embed.title || embed.description || (embed.fields && embed.fields.length > 0) || embed.thumbnail || embed.image || embed.footer || embed.timestamp;
            previewElements.embed.style.display = hasContent ? 'flex' : 'none';
        }

        // --- Get Embed Data from Form ---
        function getEmbedData(forDiscordApi = true) {
            const embed = {};

            const authorName = formElements.authorName.value.trim();
            const authorUrl = formElements.authorUrl.value.trim();
            const authorIconUrl = formElements.authorIconUrl.value.trim();
            if (authorName || authorUrl || authorIconUrl) {
                embed.author = {};
                if (authorName) embed.author.name = authorName;
                if (isValidHttpUrl(authorUrl)) embed.author.url = authorUrl;
                if (isValidHttpUrl(authorIconUrl)) embed.author.icon_url = authorIconUrl;
            }

            const title = formElements.title.value.trim();
            const url = formElements.url.value.trim();
            if (title) embed.title = title;
            if (isValidHttpUrl(url)) embed.url = url;

            const description = formElements.description.value.trim();
            if (description) embed.description = description;

            const color = formElements.color.value;
            if (color !== '#ffffff' && color) embed.color = hexToDec(color);

            const fields = [];
            $$('.field-item').forEach(fieldDiv => {
                const name = fieldDiv.querySelector('.field-name').value.trim();
                const value = fieldDiv.querySelector('.field-value').value.trim();
                const inline = fieldDiv.querySelector('.field-inline').checked;
                if (name && value) {
                    fields.push({ name, value, inline });
                }
            });
            if (fields.length > 0) embed.fields = fields;

            const thumbnailUrl = formElements.thumbnailUrl.value.trim();
            if (isValidHttpUrl(thumbnailUrl)) embed.thumbnail = { url: thumbnailUrl };

            const imageUrl = formElements.imageUrl.value.trim();
            if (isValidHttpUrl(imageUrl)) embed.image = { url: imageUrl };

            const footerText = formElements.footerText.value.trim();
            const footerIconUrl = formElements.footerIconUrl.value.trim();
            const timestampChecked = formElements.timestamp.checked;
            if (footerText || footerIconUrl || timestampChecked) {
                embed.footer = {};
                if (footerText) embed.footer.text = footerText;
                if (isValidHttpUrl(footerIconUrl)) embed.footer.icon_url = footerIconUrl;
            }
            if (timestampChecked) embed.timestamp = new Date(); // Discord API accepts ISO 8601 timestamp

            return forDiscordApi ? { embeds: [embed] } : embed;
        }

        // --- Load Embed Data into Form ---
        function loadEmbedData(embed) {
            formElements.authorName.value = embed.author?.name || '';
            formElements.authorUrl.value = embed.author?.url || '';
            formElements.authorIconUrl.value = embed.author?.icon_url || '';
            formElements.title.value = embed.title || '';
            formElements.url.value = embed.url || '';
            formElements.description.value = embed.description || '';
            formElements.color.value = embed.color ? '#' + embed.color.toString(16).padStart(6, '0') : '#ffffff';

            // Clear existing fields and add new ones
            formElements.fieldsContainer.innerHTML = '';
            embed.fields?.forEach(field => addField(field.name, field.value, field.inline));

            formElements.thumbnailUrl.value = embed.thumbnail?.url || '';
            formElements.imageUrl.value = embed.image?.url || '';
            formElements.footerText.value = embed.footer?.text || '';
            formElements.footerIconUrl.value = embed.footer?.icon_url || '';
            formElements.timestamp.checked = !!embed.timestamp; // Convert truthy value to boolean

            updatePreview();
        }

        // --- Event Listeners ---
        // Inputs for live preview
        $$('.controls input, .controls textarea').forEach(input => {
            if (input.id !== 'io-code') { // Exclude the code input itself
                input.addEventListener('input', updatePreview);
            }
        });
        formElements.timestamp.addEventListener('change', updatePreview);
        formElements.addFieldBtn.addEventListener('click', () => addField());

        // --- Code Generation/Loading (Task 5) ---
        formElements.getCodeBtn.addEventListener('click', () => {
            const embedData = getEmbedData(false); // Get raw embed object
            if (Object.keys(embedData).length === 0) {
                formElements.statusMessage.textContent = 'No hay datos de embed para guardar.';
                formElements.statusMessage.style.color = '#f04747';
                return;
            }
            const jsonString = JSON.stringify(embedData);
            formElements.ioCode.value = btoa(jsonString); // Base64 encode
            formElements.statusMessage.textContent = 'Código generado, cópialo para guardar.';
            formElements.statusMessage.style.color = '#43b581';
            formElements.ioCode.select(); // Select the text for easy copying
            document.execCommand('copy');
        });

        formElements.loadCodeBtn.addEventListener('click', () => {
            const encodedData = formElements.ioCode.value.trim();
            if (!encodedData) {
                formElements.statusMessage.textContent = 'Pega un código en el campo de texto para cargar.';
                formElements.statusMessage.style.color = '#f04747';
                return;
            }
            try {
                const jsonString = atob(encodedData); // Base64 decode
                const embed = JSON.parse(jsonString);
                loadEmbedData(embed);
                formElements.statusMessage.textContent = 'Embed cargado exitosamente.';
                formElements.statusMessage.style.color = '#43b581';
            } catch (e) {
                formElements.statusMessage.textContent = 'Error al cargar el código. Asegúrate de que sea válido.';
                formElements.statusMessage.style.color = '#f04747';
                console.error("Error decoding or parsing embed data:", e);
            }
        });

        // --- Send Embed to Discord (Task 7) ---
        formElements.sendEmbedBtn.addEventListener('click', async () => {
            const channelId = formElements.channelId.value.trim();
            if (!channelId) {
                formElements.statusMessage.textContent = 'Por favor, introduce la ID del canal.';
                formElements.statusMessage.style.color = '#f04747';
                return;
            }

            const embedData = getEmbedData(true); // Get embed data formatted for Discord API

            if (!embedData || !embedData.embeds || embedData.embeds.length === 0 || Object.keys(embedData.embeds[0]).length === 0) {
                formElements.statusMessage.textContent = 'El embed está vacío. Agrega contenido para enviar.';
                formElements.statusMessage.style.color = '#f04747';
                return;
            }

            formElements.statusMessage.textContent = 'Enviando embed...';
            formElements.statusMessage.style.color = '#fff';

            try {
                const response = await fetch('embed_generator.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        action: 'send_embed',
                        channel_id: channelId,
                        embed_data: embedData
                    })
                });

                const result = await response.json();

                if (result.success) {
                    formElements.statusMessage.textContent = result.message;
                    formElements.statusMessage.style.color = '#43b581';
                } else {
                    formElements.statusMessage.textContent = `Error: ${result.message}`;
                    formElements.statusMessage.style.color = '#f04747';
                    console.error('Discord API Error:', result);
                }
            } catch (error) {
                formElements.statusMessage.textContent = 'Error de conexión con el servidor.';
                formElements.statusMessage.style.color = '#f04747';
                console.error('Fetch Error:', error);
            }
        });

        // --- Initial setup ---
        addField('Campo 1', 'Valor del campo 1'); // Add a default field
        updatePreview();

    </script>
</body>
</html>
