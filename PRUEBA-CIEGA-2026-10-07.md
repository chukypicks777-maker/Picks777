# Prueba ciega con partidos ya jugados — 7 de octubre de 2026

## Cómo se hizo

Se le dieron al modelo partidos reales que ya ocurrieron, **uno por uno y en orden de fecha**. Para cada partido el modelo solo podía ver los resultados de los partidos que empezaron antes (béisbol y básquetbol: al menos 3 horas antes; fútbol: días anteriores). No sabía quién ganó, ni el marcador, ni los córners. Después se comparó lo que dijo con lo que pasó.

- **Acierto**: porcentaje de veces que el lado que el modelo daba como más probable ocurrió.
- **"Dijo X → pasó Y"** (calibración): cuando el modelo dijo, por ejemplo, 75%, ¿pasó cerca de 75% de las veces? Es la prueba más importante: un 75% honesto vale más que un acierto alto sin respaldo.
- **Log loss**: error de las probabilidades (más bajo = mejor; 0.693 es lanzar una moneda en un sí/no).
- **Casino**: cuotas reales de cierre, sin margen. Fútbol europeo y Liga MX/MLS: Pinnacle (football-data.co.uk). MLB, NBA y WNBA: DraftKings guardado por ESPN. ESPN no guarda cuotas de tenis, así que tenis no tiene comparación con casino.
- Los parámetros de los modelos nuevos se eligieron **solo con temporadas anteriores** y se midieron en temporadas que el ajuste nunca vio.

Datos completos: `artifacts/blind-test/*.json`. Se repite con `node --import ./tests/setup.js scripts/blind-test/<deporte>.mjs` (football, baseball, basketball, tennis).

## Resumen por deporte

| Deporte | Partidos | Ganador: modelo | Ganador: casino | Mismo favorito que el casino | Diferencia media con el casino |
|---|---:|---:|---:|---:|---:|
| Fútbol Europa (5 ligas, 1X2) | 3,680 | 52.4% | 54.1% | 89.8% | 6.0 pts (local) |
| Liga MX | 760 | 51.6% | 52.8% | 86.2% | 6.2 pts |
| MLS | 1,169 | 48.4% | 49.5% | 87.8% | 5.9 pts |
| MLB 2026 | 1,962 | 54.2% | 57.7% | 72.4% | 5.1 pts |
| NBA 2025-26 | 1,046 | 69.0% | 69.5% | 87.9% | 7.6 pts |
| WNBA 2026 | 282 | 69.1% | 72.3% | 88.3% | 6.6 pts |
| Tenis ATP | 3,420 | 65.2% | — | — | — |
| Tenis WTA | 5,618 | 65.9% | — | — | — |

En fútbol el 1X2 tiene tres resultados, por eso el acierto ronda 50% también para el casino.

**Conclusión honesta:** el modelo queda cerca del casino (normalmente coincide en el favorito y se separa 5–8 puntos de media), pero **no le gana**: el casino sigue teniendo un log loss algo menor en todos los deportes. Ninguna prueba encontró ventaja sistemática contra la línea exacta del casino. Lo que sí está comprobado es que las probabilidades del modelo son **honestas** (cuando dice 75%, pasa cerca de 75%).

## Fútbol (Europa, temporadas 2024-25 a 2026-27)

| Mercado | Acierto | Dijo → pasó |
|---|---:|---|
| **Pick banquero (con cuotas)** | **83.5%** | 77%→77.5% · 83.7%→84.7% · 92.3%→93.9% |
| Pick banquero (sin cuotas) | 81.9% | 76.9%→77.8% · 83%→84.6% · 91.6%→92.9% |
| Doble oportunidad del favorito | 77.5% | 66.9%→69% · 74.7%→76.9% · 84%→88.3% |
| Más de 1.5 goles | 77.4% | 75.5%→75.3% · 83.1%→83.2% |
| Más/menos de 3.5 goles | 69.0% | 65.5%→63.6% · 74.5%→76.4% |
| Más/menos de 2.5 goles | 56.7% | 54.6%→54.1% · 63.1%→63.2% |
| Ambos anotan | 54.8% | 54.5%→53.1% · 62.8%→61.5% |
| Gol en el 2º tiempo (más de 0.5) | 81.1% | 76%→78.6% · 83.3%→85.5% |
| Gol en el 1er tiempo (más de 0.5) | 71.4% | 66.3%→65.3% · 74.4%→75.6% |
| Córners más/menos de 7.5 | 71.1% | 66.6%→65.2% · 74.4%→73.5% |
| Córners más/menos de 8.5 | 60.3% | 55.7%→54.7% · 64.2%→63.6% |
| Córners más/menos de 9.5 | 56.9% | 54.2%→55.9% · 63.1%→61.2% |
| Córners más/menos de 10.5 | 62.2% | 55.8%→53.2% · 64.7%→65.6% |
| Córners del local más/menos de 4.5 | 61.0% | 54.8%→56.3% · 64%→66% |
| Córners de la visita más/menos de 4.5 | 61.8% | 55.1%→56.2% · 64.4%→65.6% |
| Tarjetas más/menos de 3.5 | 57.5% | 54.7%→53.9% · 64.1%→62.4% |
| Tarjetas más/menos de 4.5 | 64.5% | 55.3%→57% · 64.8%→65.1% |

Pick banquero por tipo: doble oportunidad 1X 86.1% (dijo 85.9%), X2 87.8% (dijo 84.1%), más de 1.5 goles 81.6% (dijo 81%), menos de 3.5 goles 80.9% (dijo 79.7%).

Contra Pinnacle: probabilidad del local a 6 puntos de media (82% de los partidos a menos de 10 puntos); más de 2.5 goles a 4.7 puntos (91% a menos de 10).

## Béisbol (MLB 2026, mayo a septiembre)

El modelo anterior (medias de los últimos 20 partidos) quedaba **peor que lanzar una moneda** en el ganador. Se reemplazó por ratings de ataque y pitcheo ajustados por rival y localía (ajustados con MLB 2025):

| Mercado | Antes | Ahora | Casino |
|---|---:|---:|---:|
| Ganador: acierto | 52.3% | **54.2%** | 57.7% |
| Ganador: log loss | 0.695 (peor que moneda: 0.693) | **0.687** (mejor que moneda) | 0.676 |

| Mercado (ahora) | Acierto | Dijo → pasó |
|---|---:|---|
| Ganador | 54.2% | 53.6%→53.6% · 61.6%→62.5% |
| Total más/menos de 7.5 carreras | 56.9% | 55.5%→55.8% · 63%→59.6% |
| Total más/menos de 9.5 carreras | 59.7% | 56.1%→56.1% · 63.4%→63% |
| Local más/menos de 3.5 carreras | 55.9% | 54.3%→54.9% · 62.4%→61.7% |
| 5 entradas más de 2.5 | 75.5% | 75.5%→75.4% |
| ¿Extra innings? | 91.6% | 89.5%→91.5% · 90.4%→91.8% (dice "no") |

El béisbol es el deporte más difícil de predecir: incluso el casino solo acierta 57.7%. En el total a la línea exacta del casino, el modelo acierta 49.8% (sin ventaja). Se probó añadir el lanzador abridor: la mejora fue prácticamente nula, así que no se incorporó.

## Básquetbol (NBA 2025-26 y WNBA 2026)

El modelo anterior (márgenes de los últimos 20 partidos) se separaba 11 puntos de media del casino. Se reemplazó por ratings de puntos ajustados por rival y localía, con la temporada anterior como base (parámetros elegidos con NBA 2024-25 y WNBA 2025):

| | NBA antes | NBA ahora | NBA casino | WNBA antes | WNBA ahora | WNBA casino |
|---|---:|---:|---:|---:|---:|---:|
| Acierto ganador | 67.1% | **69.0%** | 69.5% | 69.9% | 69.1% | 72.3% |
| Log loss ganador | 0.623 | **0.599** | 0.568 | 0.602 | **0.583** | 0.551 |
| Diferencia media con el casino | 11.3 pts | **7.6 pts** | — | 10.5 pts | **6.6 pts** | — |

NBA, "dijo → pasó" del ganador: 64.6%→68.2% · 74.5%→76.7% · 84.1%→83%. Hándicap local +5.5: acierto 70.2% (74.8%→74.9%, 84.6%→86.2%).

En el hándicap a la línea exacta del casino el modelo acierta 46.9% (NBA) y 47.5% (WNBA): ahí **no hay ventaja**; el casino ajusta esa línea para que quede 50/50. Cuando ESPN publica cuotas, la app centra los hándicaps en el ganador del mercado.

## Tenis (ATP y WTA, ESPN)

Actualizado el 8 de octubre de 2026. Fórmula propia, sin cuotas de casas: Elo por resultados, Elo por porcentaje de juegos ganados (un 6-1 6-1 pesa más que un 7-6 7-6), puntos del ranking ATP/WTA de la última lista semanal previa y cara a cara. Pesos ajustados con marzo-septiembre de 2025; cifras de octubre de 2025 en adelante (`scripts/backtest/experiment-tennis-v2.mjs`, `scripts/blind-test/tennis.mjs`).

| | Acierto antes | Acierto ahora | Log loss antes → ahora | Favorito de 65% o más | Dijo → pasó |
|---|---:|---:|---|---:|---|
| ATP | 65.0% | **65.2%** | 0.6239 → 0.6216 | 75.9% | 54.8%→55.5% · 64.5%→67.3% · 74.3%→77.1% · 83.5%→87.6% |
| WTA | 64.1% | **65.9%** | 0.6282 → 0.6166 | 76.6% | 54.8%→56% · 64.5%→67.9% · 74.3%→76.4% · 84.2%→86.1% |

Contra Caliente (35 partidos ATP/WTA del 8-10 de octubre, sin su comisión): mismo favorito en 33, diferencia media 5.9 puntos (antes 6.8), 19 partidos a 5 puntos o menos (antes 14). El momio que muestra la app es el publicado por Pinnacle (The Odds API) o Kalshi; el porcentaje es siempre del modelo.

## Qué cambió en la app con esta prueba

1. **Béisbol MLB**: ratings por rival y localía para ganador, carreras, totales, 5 entradas, 1er inning y extra innings (`server/services/baseballRatings.js`). El historial de 120 días se consulta aparte con caché larga.
2. **Básquetbol NBA y WNBA**: ratings de puntos por rival y localía (`server/services/basketballRatings.js`). El historial de 13 meses se guarda compacto (23 KB NBA, 6 KB WNBA) y se reconstruye en segundo plano: nadie espera la descarga y Redis apenas se usa. Pretemporada NBA y NCAA femenina mantienen el método anterior.
3. Las tarjetas muestran "Ratings por rival, prueba ciega" cuando el ganador sale de estos modelos.

## Límites

- Las cifras son del pasado; no garantizan resultados futuros. Ningún modelo gana siempre.
- Los modelos no conocen lesiones, alineaciones ni lanzadores abridores.
- Todo sale de resultados reales (ESPN, MLB Stats API, football-data.co.uk); no hay datos inventados ni precalculados. DeepSeek no escribe probabilidades: solo resume hechos verificados.
