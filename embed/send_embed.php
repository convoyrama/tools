<?php

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
}


// !!! IMPORTANT: REPLACE WITH YOUR DISCORD BOT TOKEN !!!
// You can get this from your Discord Developer Portal -> Your Application -> Bot -> Token
$discordBotToken = getenv('DISCORD_TOKEN');
if ($discordBotToken === false) {
    // If the environment variable is not set, use a placeholder that will trigger the client-side error.
    // In a production environment, you might want a more robust error handling or a default value.
    $discordBotToken = 'DISCORD_TOKEN_NOT_CONFIGURED_IN_ENV';
} 

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

        if ($discordBotToken === 'DISCORD_TOKEN_NOT_CONFIGURED_IN_ENV' || empty($discordBotToken)) {
            echo json_encode(['success' => false, 'message' => 'El token del bot de Discord no está configurado en el servidor.']);
            exit;
        }

        $discordApiUrl = "https://discord.com/api/v10/channels/{$channelId}/messages";

        $ch = curl_init($discordApiUrl);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array(
            'Content-Type: application/json',
            'Authorization: Bot ' . $discordBotToken
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