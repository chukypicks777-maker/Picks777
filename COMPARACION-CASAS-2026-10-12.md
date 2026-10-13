# Comparación con las casas — 12 de octubre de 2026

Regla del dueño: los porcentajes salen solo del modelo propio. Los momios de las casas se muestran aparte y aquí se usan únicamente para medir qué tan lejos queda el modelo; nunca entran en el cálculo.

**Casas revisadas:**
- **Caliente.mx:** se pudo consultar completo.
- **Playdoit:** bloquea el acceso desde fuera de México ("Acceso bloqueado").
- **Draftea:** solo publica momios dentro de su app.
- **Betmexico:** la sección de deportes no carga fuera de México.
- **También se usaron:** DraftKings (vía ESPN) y Kalshi.

Las probabilidades de las casas están sin su comisión: cada lado se divide entre la suma de los dos.

## Tenis — 22 partidos con momio en Caliente (ATP Shanghái y WTA Wuhan)

**Resumen:**
- Diferencia media con Caliente: 5.3 puntos.
- Mismo favorito en 20 de 22 partidos. Los dos distintos son casi parejos: Birrell 50.2% y Hurkacz 44.7%.
- No hay errores de datos: ningún momio está pegado al jugador equivocado y ninguna ficha usa datos de otro jugador.
- Las mayores diferencias vienen del ranking. Kartal, por ejemplo, está fuera del top 150 que publica ESPN y por eso queda con pocos puntos.

**Por qué no se cambió el modelo de tenis:**
- Ya se había ajustado el 8 de octubre (Elo, juegos ganados, ranking y cara a cara).
- Las variables extra disponibles ya se probaron sin mejora: racha reciente y días de descanso.
- La superficie de la pista no está en los datos de ESPN.

| Partido | Circuito | Modelo (local) | Caliente | Kalshi | Diferencia vs Caliente |
|---|---|---:|---:|---:|---:|
| Mayar Sherif vs Maja Chwalinska | WTA | 34.4% | 20.8% | — | +13.6 |
| Sonay Kartal vs Belinda Bencic | WTA | 22% | 33.3% | 32% | −11.4 |
| Kimberly Birrell vs Katie Volynets | WTA | 50.2% | 39% | 38.2% | +11.3 |
| Ann Li vs Camila Osorio | WTA | 66% | 56.3% | 57.4% | +9.7 |
| Dayana Yastremska vs Cristina Bucsa | WTA | 45.3% | 54.3% | 54.5% | −9 |
| Hubert Hurkacz vs Alejandro Davidovich Fokina | ATP | 44.7% | 51.9% | 51.5% | −7.2 |
| Maria Sakkari vs Marta Kostyuk | WTA | 28.7% | 35.6% | 35% | −6.9 |
| Daria Kasatkina vs Jelena Ostapenko | WTA | 36.8% | 43.7% | 44.6% | −6.8 |
| Alexander Zverev vs Alexander Bublik | ATP | 74.9% | 69% | 70.3% | +6 |
| Botic Van De Zandschulp vs Rafael Jodar | ATP | 42.4% | 36.7% | — | +5.7 |
| Katerina Siniakova vs Liudmila Samsonova | WTA | 43% | 48.1% | 47.5% | −5.1 |
| Magdalena Frech vs Iga Swiatek | WTA | 16.7% | 11.7% | — | +5 |
| Alex de Minaur vs Karen Khachanov | ATP | 57.9% | 53.4% | 53.4% | +4.6 |
| Katie Boulter vs Diana Shnaider | WTA | 19.4% | 23.4% | 21.8% | −4 |
| Yulia Putintseva vs Zeynep Sonmez | WTA | 53.6% | 56.3% | 56.3% | −2.7 |
| Arthur Gea vs Jakub Mensik | ATP | 41.8% | 39.7% | 38.6% | +2.1 |
| Casper Ruud vs Felix Auger-Aliassime | ATP | 46.4% | 44.7% | — | +1.7 |
| Lilli Tagger vs Nikola Bartunkova | WTA | 30.9% | 32.2% | 30.7% | −1.4 |
| Daria Snigur vs Elise Mertens | WTA | 36.7% | 35.6% | 34% | +1.1 |
| Karolina Muchova vs Catherine McNally | WTA | 77.4% | 76.6% | — | +0.8 |
| Daniil Medvedev vs Stefanos Tsitsipas | ATP | 64.9% | 65.6% | — | −0.7 |
| Tommy Paul vs Zizou Bergs | ATP | 64.2% | 64.7% | 66.3% | −0.5 |

Porcentaje del primer jugador en cada caso.

## Básquetbol — el error real y su arreglo

**Caso reportado: Utah Jazz vs San Antonio Spurs (pretemporada)**
- La app daba Spurs 63.4% y Jazz 36.6%.
- Caliente da Jazz −209 (65%) y DraftKings Jazz −185 (62%). Su momio abrió al revés y se movió cuando los Spurs anunciaron descanso de Wembanyama, Castle, Vassell y Harper, con Fox en duda.
- El momio no estaba invertido. El modelo no sabía quién jugaba.

**Arreglo, 100% propio:**
- Se usan el reporte de lesiones y descansos de ESPN, la plantilla actual y los promedios de cada jugador.
- Cada jugador vale su producción por partido (game score) por la parte del rating que su equipo ganó con él.
- Así se descuentan los que no juegan, se suman los fichajes y los que vuelven de una lesión larga, y se restan los que se fueron.
- Ajustado con box scores reales de 2022-23, 2023-24 y 2024-25, y probado a ciegas en la temporada 2025-26:

| NBA 2025-26 (1,231 partidos, a ciegas) | Antes | Ahora | DraftKings |
|---|---:|---:|---:|
| Acierto del favorito | 68.6% | **70.4%** | 69.5% |
| Log loss (menor es mejor) | 0.5947 | **0.5777** | 0.5690 |
| Diferencia media con el cierre de DraftKings | 7.8 pts | **5.1 pts** | — |
| Mismo favorito que DraftKings | 86.5% | **90.7%** | — |

En la pretemporada 2025 (98 partidos, a ciegas), la diferencia con DraftKings bajó de 11.4 a 8.7 puntos y el mismo favorito subió de 76.5% a 81.6%.

**Hoy, con momio publicado:**

| Partido | Antes | Ahora | Casa |
|---|---:|---:|---:|
| Utah Jazz vs Spurs (pretemporada) | 36.6% | **57.1%** | Caliente 65.0% · DraftKings 64.5% |
| Orlando vs Cleveland (pretemporada) | 49.5% | 53.4% | DraftKings 49.6% |
| Lakers vs Warriors (pretemporada) | 54.6% | 63.2% | DraftKings 55.1% |
| Detroit vs Boston (20 oct) | 53.9% | 55.9% | Caliente 53.2% |
| Knicks vs 76ers (20 oct) | 82.0% | **69.8%** | Caliente 63.9% |

**Primera semana de temporada regular (16 partidos del 20 al 22 de octubre publicados en Caliente):**
- Diferencia media: 9.8 puntos antes, 7.9 ahora.
- Mismo favorito: 12 de 16 antes, 14 de 16 ahora.
- Las diferencias que quedan son de equipos que cambiaron mucho en el verano, como Indiana con Haliburton de regreso y Milwaukee sin Giannis. Ahí la casa sabe más que cualquier dato publicado.

## Cómo se ve en la app

- **Tarjeta de básquet:** muestra "Bajas incluidas · SA: Wembanyama, Castle, Vassell +4".
- **Análisis:** lista cada baja con su estado (fuera, en duda, descanso) y cuántos puntos resta.
- **Método:** explica el cálculo.
- **Si ESPN no responde:** el porcentaje queda con los ratings solos, como antes.

Scripts:
- `scripts/backtest/fetch-nba-boxscores.mjs`
- `scripts/backtest/experiment-basketball-availability.mjs`
- `scripts/compare-market.mjs`
