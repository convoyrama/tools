# Generador de Embeds para Discord

Esta es una utilidad web simple, contenida en un único archivo PHP, para crear y previsualizar embeds de Discord, y enviarlos a un canal de Discord específico usando un bot. También permite generar códigos temporales para guardar y cargar diseños de embeds directamente en el navegador.

## Características

*   Interfaz de usuario intuitiva con panel de control.
*   Vista previa en vivo del embed de Discord.
*   Funcionalidad para añadir y eliminar campos dinámicamente.
*   Generación de códigos Base64 que encapsulan el diseño completo del embed (sin almacenamiento en el servidor).
*   Carga de diseños de embed desde códigos Base64.
*   Envío seguro de embeds a canales de Discord a través de la API de Discord usando un Bot Token.

## Requisitos

*   Un servidor web con **PHP** (versión 7.4 o superior recomendada).
*   La extensión **cURL** de PHP habilitada (necesaria para la comunicación con la API de Discord).
*   Un **Bot de Discord** configurado y su **Token** (ver la sección "Configuración del Bot de Discord").
*   La ID del canal de Discord donde deseas enviar los embeds.

## Instalación y Configuración

1.  **Copia el archivo:**
    Copia el archivo `embed_generator.php` en el directorio raíz de tu servidor web (por ejemplo, `htdocs` para Apache o `www` para Nginx).

2.  **Configura el Token del Bot de Discord:**
    Abre `embed_generator.php` en un editor de texto. En la parte superior del archivo, encontrarás la siguiente línea:

    ```php
    define('DISCORD_BOT_TOKEN', 'YOUR_DISCORD_BOT_TOKEN_HERE');
    ```

    Reemplaza `'YOUR_DISCORD_BOT_TOKEN_HERE'` con el token real de tu bot de Discord. **Es crucial que no compartas este token con nadie.**

3.  **Asegúrate de que cURL esté habilitado:**
    La extensión `cURL` de PHP es necesaria. Puedes verificar si está habilitada creando un archivo `phpinfo.php` con el contenido `<?php phpinfo(); ?>` y navegando a él en tu navegador. Busca "curl" en la página. Si no está habilitado, consulta la documentación de tu servidor PHP para habilitarlo (normalmente descomentando `extension=curl` en `php.ini` y reiniciando el servidor web).

## Configuración del Bot de Discord

Para enviar embeds, necesitarás un bot de Discord. Si aún no tienes uno:

1.  Ve al [Portal de Desarrolladores de Discord](https://discord.com/developers/applications).
2.  Haz clic en "New Application" (Nueva Aplicación).
3.  Dale un nombre a tu aplicación y haz clic en "Create" (Crear).
4.  En el menú de la izquierda, ve a "Bot".
5.  Haz clic en "Add Bot" (Añadir Bot) y luego en "Yes, do it!" (Sí, hazlo!).
6.  Bajo "Token", haz clic en "Copy" (Copiar). Este es el token que necesitas pegar en `embed_generator.php`. **Mantén este token en secreto.**
7.  Asegúrate de que tu bot tenga los permisos necesarios en tu servidor de Discord (por ejemplo, `Send Messages`, `Embed Links`).
8.  Para invitar a tu bot a tu servidor, ve a "OAuth2" -> "URL Generator".
    *   Selecciona el alcance (`Scope`) `bot`.
    *   En "Bot Permissions" (Permisos del Bot), selecciona `Send Messages` y `Embed Links`.
    *   Copia la URL generada y ábrela en tu navegador para añadir el bot a tu servidor.

## Uso

1.  Accede a `embed_generator.php` a través de tu navegador (por ejemplo, `http://localhost/embed_generator.php`).
2.  Rellena los campos del "Panel de Control" para diseñar tu embed. La "Vista Previa" se actualizará en tiempo real.
3.  **Para guardar o compartir un diseño:** Haz clic en "Obtener Código para Guardar". Se generará un código Base64 en el área de texto. Cópialo y guárdalo.
4.  **Para cargar un diseño existente:** Pega un código Base64 en el área de texto y haz clic en "Cargar desde Código".
5.  **Para enviar el embed a Discord:**
    *   Asegúrate de tener la **ID del Canal** de Discord (puedes obtenerla activando el "Modo Desarrollador" en Discord, haciendo clic derecho en un canal y seleccionando "Copiar ID").
    *   Pega la ID del canal en el campo "ID del Canal de Discord".
    *   Haz clic en "Enviar Embed". El bot enviará el embed a ese canal. El mensaje de estado te indicará si fue exitoso o si hubo algún error.

## Notas Adicionales

*   Los códigos generados por "Obtener Código para Guardar" son largos porque contienen *toda* la información del embed codificada en Base64. Esto permite que la herramienta sea "stateless" y no requiera una base de datos o almacenamiento en el servidor para los diseños de embeds.
*   El campo de descripción acepta Markdown básico de Discord, pero la vista previa solo realiza una conversión simple de saltos de línea (`\n` a `<br>`).
*   Los campos `URL del Autor` y `URL del Título`, así como las `URL de Miniatura` e `Imagen Principal`, solo se mostrarán si son URLs HTTP o HTTPS válidas.
