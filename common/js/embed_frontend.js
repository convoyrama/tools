import { $, $$, loadTranslations, translate, applyTranslations, getGameTime, GAME_TIME_ANCHOR_UTC_MINUTES, TIME_SCALE } from './utils.js';

        // --- i18n Utility (page specific parts) ---
        let currentLanguage = localStorage.getItem('selectedLanguage') || 'es'; // Default to Spanish

        async function embedLoadTranslations(lang) { // Renamed to avoid conflict
            await loadTranslations(lang); // Call the common loadTranslations
            // Page specific apply translations if needed, otherwise rely on common applyTranslations
            applyTranslations(); // Apply global translations
            document.title = translate('app_title'); // Page-specific title translation
        }

        // Elements
        const formElements = {
            languageSelect: $('#language-select'),
            channelId: $("#channel-id"),
            authorName: $("#author-name"),
            authorUrl: $("#author-url"),
            authorIconUrl: $("#author-icon-url"),
            title: $("#title"),
            url: $("#url"),
            description: $("#description"),
            color: $("#color"),
            thumbnailUrl: $("#thumbnail-url"),
            imageUrl: $("#image-url"),
            footerText: $("#footer-text"),
            footerIconUrl: $("#footer-icon-url"),
            timestamp: $("#timestamp"),
            fieldsContainer: $("#fields-container"),
            addFieldBtn: $("#add-field"),
            sendEmbedBtn: $("#send-embed"),
            statusMessage: $("#status-message"),
            ioCode: $("#io-code"),
            getCodeBtn: $("#get-code"),
            loadCodeBtn: $("#load-code"),
            flyerUpload: $("#flyer-upload"),
            loadFlyerDataBtn: $("#load-flyer-data"),
            unixDate: $("#unix-date"),
            unixTime: $("#unix-time"),
            unixTimestampDisplay: $("#unix-timestamp-display"),
            copyUnixTimestampBtn: $("#copy-unix-timestamp"),
            gameTimeDisplay: $("#game-time-display"),
            copyGameTimeBtn: $("#copy-game-time"),
            profileSelect: $("#profile-select"),
            profileNameInput: $("#profile-name-input"),
            saveProfileBtn: $("#save-profile"),
            loadProfileBtn: $("#load-profile"),
            deleteProfileBtn: $("#delete-profile")
        };

        const previewElements = {
            embed: $("#preview-embed"),
            sidebar: $(".embed-sidebar"),
            author: $(".embed-author"),
            authorIcon: $(".embed-author-icon"),
            authorName: $(".embed-author-name"),
            title: $(".embed-title"),
            description: $(".embed-description"),
            fields: $(".embed-fields"),
            thumbnail: $(".embed-thumbnail"),
            thumbnailImg: $(".embed-thumbnail img"),
            image: $(".embed-image"),
            imageImg: $(".embed-image img"),
            footer: $(".embed-footer"),
            footerIcon: $(".embed-footer-icon"),
            footerText: $(".embed-footer-text"),
            footerSeparator: $(".embed-footer-separator"),
            timestamp: $(".embed-timestamp")
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
                .replace(/\\/g, "\\\\") // Escape backslashes first
                .replace(/([*_~`|>])/g, "\\$1"); // Escape Discord special characters
        }

        /**
         * Reads tEXt chunks from a PNG ArrayBuffer.
         * Assumes the PNG is valid and focuses only on tEXt chunks.
         * @param {ArrayBuffer} arrayBuffer - The ArrayBuffer of the PNG file.
         * @returns {Array<Object>} An array of objects, each with { keyword: string, text: string }.
         */
        function readPngTextChunks(arrayBuffer) {
            const dataView = new DataView(arrayBuffer);
            let offset = 8; // Skip PNG signature (8 bytes)
            const textChunks = [];

            while (offset < arrayBuffer.byteLength) {
                if (offset + 8 > arrayBuffer.byteLength) break; // Ensure there's enough data for chunk length and type
                
                const length = dataView.getUint32(offset, false); // Length is big-endian
                offset += 4;

                if (offset + 4 > arrayBuffer.byteLength) break; // Ensure there's enough data for chunk type
                const typeCode = String.fromCharCode(
                    dataView.getUint8(offset),
                    dataView.getUint8(offset + 1),
                    dataView.getUint8(offset + 2),
                    dataView.getUint8(offset + 3)
                );
                offset += 4;

                const chunkDataEnd = offset + length;
                if (chunkDataEnd > arrayBuffer.byteLength) break; // Ensure chunk data doesn't exceed file length

                if (typeCode === 'tEXt') {
                    let keyword = '';
                    let text = '';
                    let nullSeparatorFound = false;

                    for (let i = 0; i < length; i++) {
                        const byte = dataView.getUint8(offset + i);
                        if (byte === 0 && !nullSeparatorFound) {
                            nullSeparatorFound = true;
                            continue;
                        }
                        if (!nullSeparatorFound) {
                            keyword += String.fromCharCode(byte);
                        } else {
                            text += String.fromCharCode(byte);
                        }
                    }
                    if (keyword && text) { // Only add if both keyword and text are non-empty
                        textChunks.push({ keyword, text });
                    }
                }
                
                offset = chunkDataEnd + 4; // Move past data and 4-byte CRC
            }
            return textChunks;
        }

        function updateUnixTimestamp() {
            const dateStr = formElements.unixDate.value;
            const timeStr = formElements.unixTime.value;

            if (dateStr && timeStr) {
                // Combine date and time, assuming UTC for the input
                // The 'Z' at the end indicates UTC
                const dateTimeUTC = new Date(`${dateStr}T${timeStr}:00Z`);
                
                // Check if the date is valid
                if (!isNaN(dateTimeUTC.getTime())) {
                    const unixTimestampSeconds = Math.floor(dateTimeUTC.getTime() / 1000);
                    formElements.unixTimestampDisplay.value = unixTimestampSeconds;
                    formElements.statusMessage.textContent = '';
                    formElements.statusMessage.style.color = '';
                } else {
                    formElements.unixTimestampDisplay.value = '';
                    formElements.statusMessage.textContent = translate('msg_invalid_date_time');
                    formElements.statusMessage.style.color = '#f04747';
                }
            } else {
                formElements.unixTimestampDisplay.value = '';
                formElements.statusMessage.textContent = '';
                formElements.statusMessage.style.color = '';
            }
            updateGameTime(); // Also update game time when Unix timestamp changes
        }

        function updateGameTime() {
            const dateStr = formElements.unixDate.value;
            const timeStr = formElements.unixTime.value;

            if (dateStr && timeStr) {
                const dateTimeUTC = new Date(`${dateStr}T${timeStr}:00Z`);
                const gameTimeObj = getGameTime({ // Pass an object that mimics luxon.DateTime for getGameTime compatibility
                    hour: dateTimeUTC.getUTCHours(), 
                    minute: dateTimeUTC.getUTCMinutes(),
                    isValid: true
                });
                formElements.gameTimeDisplay.value = `${String(gameTimeObj.hours).padStart(2, '0')}:${String(gameTimeObj.minutes).padStart(2, '0')}`;
            } else {
                formElements.gameTimeDisplay.value = '';
            }
        }

        // --- Profile Management ---
        const LOCAL_STORAGE_PREFIX = 'embed_profile_';

        function populateProfileSelect() {
            formElements.profileSelect.innerHTML = '<option value="">-- Nuevo Perfil --</option>'; // Always have "New Profile" option
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(LOCAL_STORAGE_PREFIX)) {
                    const profileName = key.substring(LOCAL_STORAGE_PREFIX.length);
                    const option = document.createElement('option');
                    option.value = profileName;
                    option.textContent = profileName;
                    formElements.profileSelect.appendChild(option);
                }
            }
            formElements.profileNameInput.value = ''; // Clear input field
        }

        function saveProfile() {
            let profileName = formElements.profileNameInput.value.trim();
            if (!profileName) {
                profileName = formElements.profileSelect.value;
            }

            if (!profileName) {
                formElements.statusMessage.textContent = translate('msg_enter_profile_name');
                formElements.statusMessage.style.color = '#f04747';
                return;
            }

            const embedData = getEmbedData(false); // Get raw embed object
            if (Object.keys(embedData).length === 0) {
                formElements.statusMessage.textContent = translate('msg_no_embed_data_to_save');
                formElements.statusMessage.style.color = '#f04747';
                return;
            }

            try {
                localStorage.setItem(LOCAL_STORAGE_PREFIX + profileName, JSON.stringify(embedData));
                formElements.statusMessage.textContent = translate('msg_profile_saved_success', { profileName: profileName });
                formElements.statusMessage.style.color = '#43b581';
                populateProfileSelect();
                formElements.profileSelect.value = profileName; // Select the newly saved profile
            } catch (e) {
                formElements.statusMessage.textContent = translate('msg_error_saving_profile');
                formElements.statusMessage.style.color = '#f04747';
                console.error('Error saving profile:', e);
            }
        }

        function loadProfile() {
            const profileName = formElements.profileSelect.value;
            if (!profileName) {
                formElements.statusMessage.textContent = translate('msg_select_profile_to_load');
                formElements.statusMessage.style.color = '#f04747';
                return;
            }

            try {
                const storedData = localStorage.getItem(LOCAL_STORAGE_PREFIX + profileName);
                if (storedData) {
                    const embed = JSON.parse(storedData);
                    loadEmbedData(embed);
                    formElements.statusMessage.textContent = translate('msg_profile_loaded_success', { profileName: profileName });
                    formElements.statusMessage.style.color = '#43b581';
                    formElements.profileNameInput.value = profileName;
                } else {
                    formElements.statusMessage.textContent = translate('msg_profile_not_exist');
                    formElements.statusMessage.style.color = '#f04747';
                }
            } catch (e) {
                formElements.statusMessage.textContent = translate('msg_error_loading_profile');
                formElements.statusMessage.style.color = '#f04747';
                console.error('Error loading profile:', e);
            }
        }

        function deleteProfile() {
            const profileName = formElements.profileSelect.value;
            if (!profileName) {
                formElements.statusMessage.textContent = translate('msg_select_profile_to_delete');
                formElements.statusMessage.style.color = '#f04747';
                return;
            }

            if (confirm(translate('msg_confirm_delete_profile', { profileName: profileName }))) {
                try {
                    localStorage.removeItem(LOCAL_STORAGE_PREFIX + profileName);
                    formElements.statusMessage.textContent = translate('msg_profile_deleted_success', { profileName: profileName });
                    formElements.statusMessage.style.color = '#43b581';
                    populateProfileSelect();
                } catch (e) {
                    formElements.statusMessage.textContent = translate('msg_error_deleting_profile');
                    formElements.statusMessage.style.color = '#f04747';
                    console.error('Error deleting profile:', e);
                }
            }
        }

        // --- Field Management ---
        function addField(name = '', value = '', inline = false) {
            fieldCounter++;
            const fieldId = `field-${fieldCounter}`;
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'field-item';
            fieldDiv.dataset.fieldId = fieldId;

            fieldDiv.innerHTML = `
                <input type="text" class="field-name" data-i18n-placeholder="field_name_placeholder" value="${escapeMarkdown(name)}">
                <input type="text" class="field-value" data-i18n-placeholder="field_value_placeholder" value="${escapeMarkdown(value)}">
                <div class="field-inline-checkbox">
                    <label><span data-i18n="inline_field_label"></span> <input type="checkbox" class="field-inline" ${inline ? 'checked' : ''}></label>
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
            const hasTimestamp = formElements.timestamp.checked; // Check the form element directly

            if (hasFooterText || hasFooterIcon || hasTimestamp) {
                previewElements.footer.style.display = 'flex';
                previewElements.footerText.textContent = hasFooterText ? embed.footer.text : '';
                previewElements.footerIcon.src = hasFooterIcon ? embed.footer.icon_url : '';
                previewElements.footerIcon.style.display = hasFooterIcon ? 'block' : 'none';

                if (hasTimestamp) {
                    const unixTimestampValue = formElements.unixTimestampDisplay.value;
                    let displayTime = '';
                    if (unixTimestampValue) {
                        // Display the user-entered/calculated Unix timestamp
                        displayTime = new Date(parseInt(unixTimestampValue) * 1000).toLocaleString('es-ES', {
                            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
                        });
                    } else {
                        // Fallback to current time if timestamp checkbox is checked but no unix timestamp is set
                        displayTime = new Date().toLocaleString('es-ES', {
                            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
                        });
                    }
                    previewElements.timestamp.textContent = displayTime;
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
            if (timestampChecked && formElements.unixTimestampDisplay.value) {
                 // Use the Unix timestamp from the input field
                embed.timestamp = new Date(parseInt(formElements.unixTimestampDisplay.value) * 1000).toISOString();
            } else if (timestampChecked) {
                // Fallback to current time if checkbox is checked but no unix timestamp
                embed.timestamp = new Date().toISOString();
            }
            
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
            
            // Handle timestamp loading
            if (embed.timestamp) {
                formElements.timestamp.checked = true; // Check the display timestamp checkbox
                const date = new Date(embed.timestamp);
                // Format date to YYYY-MM-DD for input type="date"
                formElements.unixDate.value = date.toISOString().split('T')[0];
                // Format time to HH:MM:SS for input type="time"
                formElements.unixTime.value = date.toISOString().split('T')[1].substring(0, 8);
                updateUnixTimestamp(); // Update the displayed Unix timestamp
            } else {
                formElements.timestamp.checked = false;
                formElements.unixDate.value = '';
                formElements.unixTime.value = '';
                formElements.unixTimestampDisplay.value = '';
            }

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

        formElements.loadFlyerDataBtn.addEventListener('click', () => {
            const file = formElements.flyerUpload.files[0];
            if (!file) {
                formElements.statusMessage.textContent = translate('msg_select_png');
                formElements.statusMessage.style.color = '#f04747';
                return;
            }

            if (file.type !== 'image/png') {
                formElements.statusMessage.textContent = translate('msg_not_png');
                formElements.statusMessage.style.color = '#f04747';
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const textChunks = readPngTextChunks(arrayBuffer);
                    const eventDataChunk = textChunks.find(chunk => chunk.keyword === 'convoyrama-event-data');

                    if (eventDataChunk) {
                        const eventData = JSON.parse(eventDataChunk.text);
                        // Convert eventData to a format suitable for loadEmbedData if necessary
                        // For now, assume it directly maps or requires minimal transformation
                        const embedFromFlyer = {
                            author: { name: eventData.authorName || '' },
                            title: eventData.eventName || '',
                            description: eventData.description || '',
                            color: eventData.color ? hexToDec(eventData.color) : undefined, // Convert hex to decimal
                            image: { url: eventData.mapImageUrl || eventData.imageUrl || '' }, // Assuming mapImageUrl or imageUrl from flyer
                            fields: eventData.fields || [],
                            timestamp: eventData.timestamp || undefined, // Pass timestamp if available
                            // Placeholder for other fields if needed from flyer data
                        };

                        // Populate the channel ID if present in the flyer data (less likely but possible)
                        if (eventData.channelId) {
                            formElements.channelId.value = eventData.channelId;
                        }
                        
                        loadEmbedData(embedFromFlyer);
                        formElements.statusMessage.textContent = translate('msg_flyer_loaded_success');
                        formElements.statusMessage.style.color = '#43b581';

                    } else {
                        formElements.statusMessage.textContent = translate('msg_no_event_data');
                        formElements.statusMessage.style.color = '#f04747';
                    }
                } catch (error) {
                    formElements.statusMessage.textContent = translate('msg_error_processing_flyer') + error.message;
                    formElements.statusMessage.style.color = '#f04747';
                    console.error('Error processing flyer:', error);
                }
            };
            reader.onerror = () => {
                formElements.statusMessage.textContent = translate('msg_error_reading_file');
                formElements.statusMessage.style.color = '#f04747';
            };
            reader.readAsArrayBuffer(file);
        });
        
        // Event listeners for Unix timestamp calculation
        formElements.unixDate.addEventListener('input', () => {
            updateUnixTimestamp();
            updateGameTime();
        });
        formElements.unixTime.addEventListener('input', () => {
            updateUnixTimestamp();
            updateGameTime();
        });

        formElements.copyUnixTimestampBtn.addEventListener('click', () => {
            const timestamp = formElements.unixTimestampDisplay.value;
            if (timestamp) {
                navigator.clipboard.writeText(timestamp)
                    .then(() => {
                        formElements.statusMessage.textContent = translate('msg_timestamp_copied');
                        formElements.statusMessage.style.color = '#43b581';
                    })
                    .catch(err => {
                        formElements.statusMessage.textContent = translate('msg_error_copying_timestamp');
                        formElements.statusMessage.style.color = '#f04747';
                        console.error('Error copying timestamp:', err);
                    });
            } else {
                formElements.statusMessage.textContent = translate('msg_no_timestamp_to_copy');
                formElements.statusMessage.style.color = '#f04747';
            }
        });

        formElements.copyGameTimeBtn.addEventListener('click', () => {
            const gameTime = formElements.gameTimeDisplay.value;
            if (gameTime) {
                navigator.clipboard.writeText(gameTime)
                    .then(() => {
                        formElements.statusMessage.textContent = translate('msg_game_time_copied');
                        formElements.statusMessage.style.color = '#43b581';
                    })
                    .catch(err => {
                        formElements.statusMessage.textContent = translate('msg_error_copying_game_time');
                        formElements.statusMessage.style.color = '#f04747';
                        console.error('Error copying game time:', err);
                    });
            } else {
                formElements.statusMessage.textContent = translate('msg_no_game_time_to_copy');
                formElements.statusMessage.style.color = '#f04747';
            }
        });

        // Event listeners for profile management
        formElements.saveProfileBtn.addEventListener('click', saveProfile);
        formElements.loadProfileBtn.addEventListener('click', loadProfile);
        formElements.deleteProfileBtn.addEventListener('click', deleteProfile);

        formElements.profileSelect.addEventListener('change', () => {
            if (formElements.profileSelect.value === '') {
                formElements.profileNameInput.value = ''; // Clear input for new profile
            } else {
                formElements.profileNameInput.value = formElements.profileSelect.value; // Show selected profile name
            }
        });

        
        // --- Code Generation/Loading (Task 5) ---
        formElements.getCodeBtn.addEventListener('click', () => {
            const embedData = getEmbedData(false); // Get raw embed object
            if (Object.keys(embedData).length === 0) {
                formElements.statusMessage.textContent = translate('msg_no_embed_data_to_save_code');
                formElements.statusMessage.style.color = '#f04747';
                return;
            }
            const jsonString = JSON.stringify(embedData);
            formElements.ioCode.value = btoa(jsonString); // Base64 encode
            formElements.statusMessage.textContent = translate('msg_code_generated');
            formElements.statusMessage.style.color = '#43b581';
            formElements.ioCode.select(); // Select the text for easy copying
            document.execCommand('copy');
        });
        formElements.loadCodeBtn.addEventListener('click', () => {
            const encodedData = formElements.ioCode.value.trim();
            if (!encodedData) {
                formElements.statusMessage.textContent = translate('msg_paste_code_to_load');
                formElements.statusMessage.style.color = '#f04747';
                return;
            }
            try {
                const jsonString = atob(encodedData); // Base64 decode
                const embed = JSON.parse(jsonString);
                loadEmbedData(embed);
                formElements.statusMessage.textContent = translate('msg_embed_loaded_success');
                formElements.statusMessage.style.color = '#43b581';
            } catch (e) {
                formElements.statusMessage.textContent = translate('msg_error_loading_code');
                formElements.statusMessage.style.color = '#f04747';
                console.error("Error decoding or parsing embed data:", e);
            }
        });

        // --- Send Embed to Discord (Task 7) ---
        formElements.sendEmbedBtn.addEventListener('click', async () => {
            const channelId = formElements.channelId.value.trim();
            if (!channelId) {
                formElements.statusMessage.textContent = translate('msg_enter_channel_id');
                formElements.statusMessage.style.color = '#f04747';
                return;
            }

            const embedData = getEmbedData(true); // Get embed data formatted for Discord API

            if (!embedData || !embedData.embeds || embedData.embeds.length === 0 || Object.keys(embedData.embeds[0]).length === 0) {
                formElements.statusMessage.textContent = translate('msg_embed_is_empty');
                formElements.statusMessage.style.color = '#f04747';
                return;
            }

            formElements.statusMessage.textContent = translate('msg_sending_embed');
            formElements.statusMessage.style.color = '#fff';

            try {
                const response = await fetch('send_embed.php', {
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
                    formElements.statusMessage.textContent = translate('msg_embed_sent_success');
                    formElements.statusMessage.style.color = '#43b581';
                } else {
                    formElements.statusMessage.textContent = `${translate('msg_error_sending_embed')} ${result.message || ''}`;
                    formElements.statusMessage.style.color = '#f04747';
                    console.error('Discord API Error:', result);
                }
            } catch (error) {
                formElements.statusMessage.textContent = translate('msg_connection_error');
                formElements.statusMessage.style.color = '#f04747';
                console.error('Fetch Error:', error);
            }
        });

        // --- Initial setup ---
        document.addEventListener('DOMContentLoaded', () => {
            addField(translate('default_field_name'), translate('default_field_value')); // Add a default field
            populateProfileSelect(); // Populate profiles on load
            updateUnixTimestamp(); // Initial calculation for Unix timestamp
            updateGameTime(); // Initial calculation for game time
            
            // Initial language load and apply translations
            embedLoadTranslations(currentLanguage).then(() => {
                // applyTranslations is called within embedLoadTranslations now
                updatePreview(); // Ensure preview is updated after translations
            });
        });

    </script>
</body>
</html>