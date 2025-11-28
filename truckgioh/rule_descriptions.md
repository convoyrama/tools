# Descripción de Reglas de Entorno

Aquí está el desglose de las reglas para cada uno de los 9 entornos del juego.

---

### Entornos de Ciudad ("Favorece a los Ligeros")

*   **1. Ciudad Soleada**
    *   **Descripción:** "Ideal para vehículos ágiles. Bono para Chasis y Motores Ligeros. Penalización severa para Chasis Pesados."
    *   **Reglas:**
        *   `Chasis 'Light' -> +100 HP`
        *   `Motor 'Light' -> +75 HP`
        *   `Chasis 'Heavy' -> -200 HP`

*   **2. Ciudad Lluviosa**
    *   **Descripción:** "El tráfico y los charcos son un problema. Penalización para Chasis Ligeros, bono leve para Chasis Medianos."
    *   **Reglas:**
        *   `Chasis 'Light' -> -75 HP`
        *   `Chasis 'Medium' -> +25 HP`

*   **3. Ciudad Nevada**
    *   **Descripción:** "Las calles estrechas son una pesadilla helada. Gran bono para Chasis Ligeros. Penalización catastrófica para Chasis Pesados."
    *   **Reglas:**
        *   `Chasis 'Light' -> +150 HP`
        *   `Chasis 'Medium' -> +50 HP`
        *   `Chasis 'Heavy' -> -250 HP`

### Entornos de Tierra ("Malo para los Ligeros")

*   **4. Tierra Soleada**
    *   **Descripción:** "Terreno irregular no apto para vehículos de ciudad. Penalización para Chasis y Motores Ligeros."
    *   **Reglas:**
        *   `Chasis 'Light' -> -150 HP`
        *   `Motor 'Light' -> -75 HP`

*   **5. Tierra Lluviosa**
    *   **Descripción:** "El barro es un gran problema para los ligeros, pero los pesados tienen ventaja. Penalización severa para Chasis Ligeros, bono para Chasis Pesados."
    *   **Reglas:**
        *   `Chasis 'Light' -> -200 HP`
        *   `Chasis 'Heavy' -> +75 HP`

*   **6. Tierra Nevada**
    *   **Descripción:** "Terreno difícil para los extremos. Medianos tienen ventaja. Penalización para Chasis Ligeros y Pesados, bono para Medianos."
    *   **Reglas:**
        *   `Chasis 'Light' -> -150 HP`
        *   `Chasis 'Heavy' -> -100 HP`
        *   `Chasis 'Medium' -> +50 HP`

### Entornos de Carretera ("Favorece la Potencia y Eficiencia")

*   **7. Carretera Soleada**
    *   **Descripción:** "Condiciones perfectas para la velocidad. Gran bono para Motores Pesados, bono leve para Medianos, penalización para Ligeros."
    *   **Reglas:**
        *   `Motor 'Heavy' -> +125 HP`
        *   `Motor 'Medium' -> +50 HP`
        *   `Motor 'Light' -> -75 HP`

*   **8. Carretera Lluviosa**
    *   **Descripción:** "Los pesados dominan el asfalto mojado. Bonos acumulados para Motores y Chasis Pesados. Penalizaciones para Ligeros."
    *   **Reglas:**
        *   `Motor 'Heavy' -> +125 HP`
        *   `Chasis 'Heavy' -> +75 HP`
        *   `Motor 'Light' -> -75 HP`
        *   `Chasis 'Light' -> -75 HP`

*   **9. Carretera Nevada**
    *   **Descripción:** "Condiciones complejas. El motor potente ayuda, pero el chasis pesado es un riesgo. Ligeros y Pesados reciben bonos y penalizaciones que se netean."
    *   **Reglas:**
        *   `Motor 'Heavy' -> +125 HP` y `Chasis 'Heavy' -> -100 HP` (Neto: +25 HP)
        *   `Motor 'Light' -> -75 HP` y `Chasis 'Light' -> +100 HP` (Neto: +25 HP)
        *   `Motor 'Medium' -> +50 HP`
