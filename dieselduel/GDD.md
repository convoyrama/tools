# Truck Drag Racing (Nombre provisional) - Game Design Document (GDD)

## 1. Concepto General
Un juego de "Drag Racing" (Piques/Arrancones) 1vs1 minimalista integrado con Discord.
Los jugadores reciben un enlace de desafío, configuran su transmisión y compiten en una carrera de aceleración en línea recta.
El objetivo es obtener el menor tiempo posible gestionando perfectamente los cambios de marcha y las revoluciones del motor (RPM).

**Estilo Visual:** Retro/Atari. Vista lateral 2D. El camión se mueve de izquierda a derecha.
**Plataforma:** Web (React) para el juego, Discord (Robotito) para el matchmaking y leaderboard.

## 2. Flujo del Juego

1.  **Desafío (Discord):**
    *   Usuario A usa `/desafiar @UsuarioB`.
    *   Robotito genera un enlace único para la partida.
2.  **Configuración (Web):**
    *   Al entrar, el jugador elige su **Caja de Cambios (Gearbox)**.
    *   No se ve al oponente en tiempo real (para simplificar la conexión), se compite contra el cronómetro.
3.  **La Carrera (Drag):**
    *   Semáforo de salida.
    *   El jugador acelera y cambia de marchas manualmente.
    *   Meta: Recorrer una distancia fija (ej. 1/4 de milla o 1 km).
4.  **Resultados:**
    *   Al cruzar la meta, se envía el tiempo final al servidor.
    *   Cuando ambos terminan, Robotito anuncia el ganador en Discord.
    *   Robotito guarda los mejores tiempos en un "Top 3".

## 3. Mecánicas de Conducción

### 3.1. Controles
*   **Acelerar:** Barra Espaciadora (Mantener presionado).
*   **Cambiar Marcha (Shift Up):** Flecha Arriba / W.
*   **Bajar Marcha (Shift Down):** Flecha Abajo / S. (Opcional, usualmente en drag solo subes).

### 3.2. Motor y Física
*   **RPM (Revoluciones):** El jugador debe cambiar en el "Punto Dulce" (Sweet Spot) de la banda de potencia.
*   **Over-rev (Pasarse de vueltas):**
    *   Si la aguja toca la zona roja demasiado tiempo -> **Motor Roto**.
    *   Game Over inmediato (o penalización de tiempo masiva).
*   **Stall (Ahogarse):**
    *   Cambiar demasiado pronto -> El motor cae de vueltas y la aceleración es casi nula.

### 3.3. Selección de Caja de Cambios (Estrategia)
El corazón del juego. El jugador elige una transmisión antes de correr, lo que define la dificultad y el perfil de aceleración:

1.  **10 Velocidades (Directa):**
    *   *Perfil:* Cambios largos. Menos gestión, más fácil de no errar.
    *   *Ventaja:* Aceleración constante, menos tiempo perdido cambiando.
    *   *Desventaja:* Peor recuperación si caen las RPM. Velocidad punta moderada.
2.  **12 Velocidades (Overdrive):**
    *   *Perfil:* Equilibrada. El estándar de la industria.
    *   *Ventaja:* Buen balance entre torque inicial y velocidad final.
    *   *Desventaja:* Requiere precisión en la zona media del tacómetro.
3.  **18 Velocidades (Eaton Fuller style):**
    *   *Perfil:* Complejidad máxima. Cambios rapidísimos y cortos.
    *   *Ventaja:* Mantiene el motor siempre en el pico de potencia (Power Band). Velocidad punta teórica más alta.
    *   *Desventaja:* Altísimo riesgo de error humano. "Dedo rápido" requerido. Si fallas un cambio, pierdes mucho tiempo.

## 4. Interfaz (UI)
*   **Vista:** Lateral (Side-scrolling). Fondo simple con efecto parallax.
*   **HUD:**
    *   Tacómetro gigante (RPM) con Zona Roja clara.
    *   Indicador de Marcha (N, 1, 2, 3...).
    *   Velocímetro (km/h).
    *   Semáforo de salida.

## 5. Integración con Robotito
*   Nuevo comando: `/drag [usuario]` (o reutilizar `/desafiar`).
*   Nuevo comando: `/top` o `/records` para ver los tiempos más rápidos históricos.
*   Base de datos simple (JSON) para guardar los récords.

## 6. Assets Necesarios
*   Sprite de Camión (Vista lateral).
*   Sonidos: Motor (Idle, Aceleración), Cambio de marcha, Rotura de motor.
*   Fondo (Carretera, Paisaje simple).