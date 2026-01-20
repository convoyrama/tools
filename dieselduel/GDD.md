# Diesel Duel - Game Design Document (GDD)
**Estado:** En Desarrollo Activo (Fase Híbrida: Online/Local)
**Versión:** 2.0 (Post-Implementación de Físicas Avanzadas)

## 1. Concepto General
Un juego de "Drag Racing" (Piques/Arrancones) 1vs1 minimalista con estética retro/pixel art.
El núcleo del juego es la **gestión de recursos mecánicos** (RPM, Temperatura, Turbo, Inercia) bajo presión. No es solo "cambiar cuando la luz es verde"; es sentir el motor.

## 2. Arquitectura Técnica
*   **Cliente:** React + Vite. Motor de física a 30 FPS en el cliente para suavidad visual.
*   **Servidor:** Node.js + Socket.IO. Autoridad en el emparejamiento y validación final de tiempos.
*   **Integración:** Robotito (Discord Bot) gestiona los desafíos y el Leaderboard global.
*   **Modos:**
    *   *Online (VPS):* Requiere invitación de Discord. Resultados van al Leaderboard.
    *   *Local (Dev):* Autodetección de `localhost`. Permite pruebas en solitario.

## 3. Mecánicas de Conducción (Physics Engine)

### 3.1. El Motor Diesel
*   **Rango de Operación:** 200 RPM (Idle) a 2500 RPM (Max).
*   **Zona Roja:** > 2100 RPM.
*   **Zona de Peligro (Meltdown):** > 2300 RPM.
*   **Curva de Torque:** No lineal.
    *   *Bajas vueltas:* "Turbo Lag" (poca potencia).
    *   *Medias vueltas (1500-1900):* "Sweet Spot" (Potencia máxima).
    *   *Altas vueltas:* Caída drástica de torque (Fricción).

### 3.2. Sistema de Turbo
*   **Acumulación:** Sube gradualmente cuando las RPM > 1200.
*   **Descarga:** Cae rápidamente al soltar acelerador o cambiar marcha.
*   **Boost:** Multiplicador de torque basado en la presión del turbo (0.0 a 1.0).
*   **Shift Retention (Mecánica Clave):** Al cambiar de marcha, se retiene un % del turbo basado en la precisión del cambio:
    *   *Perfecto (Diamond):* Retiene 50%.
    *   *Bueno (Gold):* Retiene 35%.
    *   *Normal (Silver):* Retiene 25%.
    *   *Malo (Bronze):* Retiene 15%.

### 3.3. Termodinámica (Temperatura)
*   **Base:** 70°C (Temperatura operativa mínima).
*   **Calentamiento:**
    *   < 1900 RPM: Termostato regula a ~90-95°C.
    *   > 1900 RPM: Sobrecalentamiento lineal (+1°C/s aprox).
    *   > 2300 RPM: **Fusión del Núcleo** (Sube explosivamente rápido).
*   **Enfriamiento:** Muy lento (inercia térmica de bloque de hierro).
*   **Game Over:** Al llegar a **120°C**, el motor explota ("Blown Engine"). El camión entra en modo inercia hasta detenerse.

### 3.4. Transmisión (12 Velocidades - Eaton Fuller Style)
*   **Caja de Cambios:** "12-Speed Organic".
*   **Ratios:** No lineales.
    *   *Marchas Bajas (1-4):* Mucho torque, cortas. Para mover el peso muerto.
    *   *Marchas Medias (5-8):* Cruceros de aceleración.
    *   *Marchas Altas (9-12):* Overdrive. Relaciones < 1.0. Requieren cambios tempranos para mantener el turbo cargado.

### 3.5. Estados de Fallo
1.  **Explosión (Temp > 120°C):** Fin inmediato de la tracción.
2.  **Stall (Ahogamiento):** Si se cambia muy pronto y las RPM caen < 1000 en marcha alta, el motor entra en "Limp Mode" (10% de torque) hasta recuperarse, perdiendo segundos valiosos.

## 4. Interfaz (UI/UX)
*   **Paralaje:** Sistema de 6 capas de profundidad (Cielo -> Montañas -> Colinas -> Árboles -> Cercas -> Pista).
*   **HUD:**
    *   Tacómetro analógico grande.
    *   Medidor de Turbo (Mini-gauge).
    *   Termómetro vertical.
    *   Luz de "Check Engine" (Azul intermitente/fija según gravedad).
*   **Feedback Visual:**
    *   Vibración de pantalla dinámica según RPM.
    *   Cara del conductor animada `(o_o)` -> `(>_<)` -> `(X_X)`.

## 5. Audio Dinámico
*   El motor de audio sintetiza el tono del motor basado en las RPM en tiempo real.
*   Efectos para Turbo, Cambio de Marcha (neumático), Explosión y Música de fondo aleatoria.
