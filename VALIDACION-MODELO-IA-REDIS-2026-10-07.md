# Motor de probabilidades, IA compartida y consumo de Redis — 7 de octubre de 2026

Revisión completa de las probabilidades de fútbol (ganador, goles, córners, tarjetas, mitades y pick banquero), del uso de la IA y del consumo de la base de datos que provocó la suspensión de Upstash. Todas las cifras proceden de comprobaciones reproducibles con datos públicos; ninguna consulta tocó la base de producción ni gastó créditos de IA.

## 1. Cómo se midió

**Backtest "walk-forward"** (`scripts/backtest-football.mjs`): para cada día, los modelos se ajustan solo con partidos de días anteriores y luego se compara el pronóstico con el resultado real.

- Datos: football-data.co.uk, Premier League, LaLiga, Serie A, Ligue 1 y Bundesliga, temporadas 2021-22 a 2026-27 (9 158 partidos con goles, córners, tarjetas, tiros a puerta y cuotas).
- Entrenamiento (para elegir parámetros): 2021-22 a 2023-24. **Prueba (cifras de este informe): 2024-25 a 2026-27, ~3 040 partidos**, nunca usados para ajustar nada.
- "Actual" = el cálculo que estaba en producción, llamado directamente (`applyLegacyFootballForecast`). "Nuevo" = el motor publicado ahora.
- Métricas: acierto (opción más probable), Brier (menor es mejor) y **error de calibración** (puntos porcentuales entre lo que se dice y lo que ocurre; 0 sería perfecto).

Comprobación independiente con datos de ESPN 2026 (`scripts/backtest-football-espn.mjs`) para Liga MX, MLS y Champions, que football-data no cubre con córners.

## 2. Resultados de fútbol (temporadas de prueba)

| Mercado | Acierto actual | Acierto nuevo | Brier | Error de calibración (pts) |
|---|---:|---:|---|---|
| Ganador 1X2 sin cuotas | 50,4 % | **52,2 %** | 0,6099 → 0,5921 | 2,16 → 1,66 |
| Ganador 1X2 con cuotas | 53,2 % | 53,2 % | 0,5800 → 0,5798 | 0,85 → 0,96 |
| Over 2.5 (solo hay cuota 1X2) | 54,8 % | **58,1 %** | 0,2480 → 0,2401 | 3,12 → 0,88 |
| Over 1.5 (solo cuota 1X2) | 76,9 % | 77,0 % | 0,1774 → 0,1729 | 2,24 → 1,54 |
| Ambos anotan (solo cuota 1X2) | 55,1 % | 55,1 % | 0,2488 → 0,2453 | 2,74 → 2,11 |
| Over 2.5 sin cuotas | 54,8 % | 56,5 % | 0,2480 → 0,2422 | 3,12 → 0,95 |
| **Córners totales 8.5** | 54,9 % | **60,0 %** | 0,2661 → 0,2362 | **13,38 → 1,66** |
| **Córners totales 9.5** | 51,6 % | **57,0 %** | 0,2767 → 0,2441 | **14,27 → 1,92** |
| Córners totales 7.5 | 66,5 % | 70,9 % | 0,2269 → 0,2041 | 11,74 → 1,83 |
| Córners totales 10.5 | 59,5 % | 62,8 % | 0,2533 → 0,2291 | 12,76 → 1,78 |
| Córners del local 4.5 | 56,4 % | 61,1 % | 0,2551 → 0,2327 | 9,88 → 2,32 |
| Córners de la visita 4.5 | 53,6 % | 62,7 % | 0,2686 → 0,2297 | 15,34 → 2,91 |
| Tarjetas totales 3.5 | 55,5 % | 57,5 % | 0,2530 → 0,2395 | 7,28 → 1,29 |
| Tarjetas totales 4.5 | 61,6 % | 64,8 % | 0,2364 → 0,2225 | 7,55 → 2,23 |
| Goles 1ª mitad Over 0.5 | 71,2 % | 71,5 % | 0,2054 → 0,2004 | 4,07 → 1,01 |
| Goles 1ª mitad Over 1.5 | 64,8 % | 66,2 % | 0,2247 → 0,2188 | 4,24 → 2,44 |

Referencia: el cierre de Pinnacle (la casa más eficiente) acierta el 53,9 % del 1X2 con Brier 0,5779. Con cuotas, el modelo nuevo queda prácticamente en ese nivel; **ningún modelo público supera de forma sostenida al mercado de cierre**.

**El problema más grave era córners y tarjetas.** El cálculo anterior sumaba el promedio de córners de cada equipo e ignoraba al rival: cuando decía "Over 8.5 córners al 85 %", ocurría el 64 %; cuando decía 25 %, ocurría el 60 %. Era casi ruido. El modelo nuevo dice 64 % y ocurre 64 %.

### Pick banquero (el pick principal de cada partido)

| Situación | Acierto real | Probabilidad media anunciada |
|---|---:|---:|
| Con cuotas 1X2 y de goles | **83,3 %** | 82,6 % |
| Solo cuota 1X2 | **82,9 %** (antes 81,7 %) | 82,2 % |
| Sin cuotas | **81,6 %** (antes 79,5 %) | 80,7 % |

Por tramos (con cuotas): picks anunciados al 70-80 % aciertan el 77 %; al 80-90 % aciertan el 85 %; al 90-100 % aciertan el 94 %. Es decir, **las probabilidades están calibradas**: el porcentaje que ve el usuario es el que ocurre. Los picks son sobre todo Doble Oportunidad, Over 1.5 y Under 3.5: alta tasa de acierto, cuotas bajas. Una tasa alta de acierto no implica ganancia si la cuota pagada es menor que la justa.

### Liga MX, MLS y Champions (ESPN, 2026)

| Liga | Córners 8.5 log-loss (antes → ahora) | Ganador sin cuotas (antes → ahora) |
|---|---|---|
| MLS (405 / 329 partidos) | 0,736 → 0,654 | 39,8 % → 47,4 % de acierto |
| Liga MX (250 / 43) | 0,699 → 0,657 | 34,9 % → 46,5 % |
| Champions (86) | 0,815 → 0,662 | — |

Tarjetas 3.5 mejora en MLS, Liga MX, Premier, Serie A y Ligue 1; queda igual o apenas peor en LaLiga y Champions (muestras pequeñas).

## 3. Qué cambió en el motor (`src/utils/footballModel.js`)

1. **Ratings de ataque y defensa ajustados por rival y por localía**, con ponderación temporal (vida media 240 días para la superioridad y 540 días para el ritmo de goles) y contracción bayesiana hacia la media de la liga. Los equipos recién ascendidos parten de un rating inferior a la media.
2. **Tiros a puerta** como segunda señal (25 % en la superioridad y 40 % en el total): predicen los goles futuros mejor que los propios goles.
3. **Distribución Dixon-Coles** (Poisson con corrección de marcadores bajos, ρ = −0,07): más empates realistas.
4. **Cuotas**: margen retirado con el método *power* (mejor calibrado que el proporcional, sobre todo en favoritos y sorpresas). Mezclar modelo y mercado empeoraba el 1X2, así que con cuotas el 1X2 mostrado es el del mercado.
5. **Total de goles con solo cuota 1X2**: se deduce del precio del empate y se combina con el modelo. Antes salía de un Poisson de temporada (a veces de 5 partidos) que podía contradecir al favorito del mercado: ahora marcador probable, goles y 1X2 son coherentes.
6. **Córners y tarjetas**: ratings propios ajustados por rival y **binomial negativa** con la sobre-dispersión medida (los córners varían más que un Poisson).
7. **Goles por mitad** con el reparto observado en la liga (≈43-46 % antes del descanso).
8. **Básquetbol**: se añadió la ventaja de local de la competición. NBA 2025-26 (1 128 partidos): acierto del ganador sin cuotas 66,8 % → 67,5 %.

El método anterior se conserva como respaldo cuando no hay historial de liga ni cuotas.

## 4. La IA

La IA sigue sin poder inventar cifras (decisión de seguridad previa que se mantiene: solo prioriza hechos verificados). Lo que cambió:

- **Catálogo de hechos más rico**: córners y tarjetas esperados, goles por equipo y por mitad, contraste modelo-vs-mercado y tiros a puerta. La IA tiene más material verificado para destacar.
- **Una selección por partido para todos los usuarios**: antes la clave del informe incluía la hora de consulta del feed (cambiaba cada 60 s) y cada miembro que abría la app volvía a pagar la IA por cada partido. Ahora la selección (IDs de hechos + modelo + hora, ~200 bytes) se guarda una vez y se vuelve a pintar con los números del momento.
- **Bloqueo entre instancias**: si otra instancia ya está consultando a la IA sobre ese partido, se espera su resultado en vez de pagar dos veces.
- **La cuota de IA solo se cobra al generar**: leer un informe existente es gratis. Antes, cada lectura consumía cupo y la cuota global diaria (1 000) podía agotarse con pocos visitantes.
- **Lectura por lotes** (`POST /api/matches/ai-reports`): la barra automática pide en una sola solicitud todos los informes ya generados y solo genera los que faltan. Antes eran decenas de solicitudes por visitante.
- Béisbol, tenis y básquetbol ya no guardan cada informe dos veces.

## 5. Base de datos (Redis) y lentitud

Causa de la suspensión: se escribían en Redis, cada 15-60 segundos, calendarios completos de ESPN, MLB y tenis (cientos de KB cada uno), y además cada login/logout reenviaba la base de usuarios completa.

| Cambio | Efecto |
|---|---|
| Caché de proveedores solo en memoria por defecto | Calendarios, marcadores, detalles y rankings ya no tocan Redis. Solo persisten informes de IA, resúmenes históricos inmutables, días pasados de NPB y los modelos de liga. |
| Modelo de liga compacto (1,4-7 KB) | Sustituye hasta 20 resúmenes de ESPN de ~400 KB por partido abierto; se reconstruye cada 6 h y se sirve el anterior mientras tanto. |
| Login/logout sin cambios no escriben | Antes cada login subía la base de accesos 2 veces. Un logout repetido con la misma cookie ya no la reescribe (y tiene límite de frecuencia). |
| Lista de dispositivos acotada (10 por usuario, 20 por código) | Frena el crecimiento del registro: cada login sin cookie añadía un ID aleatorio. |
| Validación de sesión sin listas de dispositivos | Cada petición autenticada transfería hasta ~6 KB innecesarios. |
| Configuración de IA y de comunidad en memoria 30 s | Una consulta a Redis menos por carga de página. |
| Limitador y CAS con EVALSHA | Se envía el resumen de 40 bytes en vez del script. |

Rendimiento percibido:

- Feed de fútbol en caliente: **13 ms** (antes recalculaba ~75 partidos en cada petición).
- Respuesta del calendario: vista ligera sin distribución de marcadores, córners ni textos repetidos; el detalle completo se pide al abrir el partido.
- El cliente sondea el calendario cada **60 s** (antes 25 s, descargando lo mismo dos veces).
- Paquete inicial de JavaScript: **661 KB → 481 KB**; el detalle, el panel de administración y otros deportes se cargan al abrirse.
- Compresión gzip de respuestas JSON en hosts distintos de Vercel (Vercel ya comprime en su CDN).

## 6. Seguridad

- **Amplificación por logout**: una cookie ya revocada podía reenviarse indefinidamente y cada intento reescribía la base completa en Redis. Corregido (sin escritura si ya está revocada) y con límite de 30 por 15 minutos por IP.
- **Amplificación por IDs inventados**: `GET /api/matches/<id inexistente>` forzaba una recarga completa de los calendarios (≈100 peticiones a ESPN y escrituras). Ahora se validan los IDs y como máximo hay una recarga forzada cada 30 s por instancia.
- **Exención de cuota de IA**: se eximía a cualquier sesión cuyo código se llamara "MASTER" o con ciertos campos; ahora solo el rol Owner calculado por el servidor.
- Validación de IDs en análisis de otros deportes.

## 7. Verificación

- 210 pruebas unitarias aprobadas (14 nuevas: motor, historial ESPN, IA compartida, cuota, bloqueo entre instancias, escrituras omitidas, caché solo en memoria, compresión, servir el modelo anterior mientras se reconstruye). Logs: `artifacts/opt-2026-10-07/unit-tests.txt`, `lint.txt`, `build.txt`.
- Lint y compilación sin errores.
- Pruebas de navegador en Chromium, WebKit (iPhone) y Firefox: 233 de 234 aprobadas en la corrida completa; la restante (Firefox) agotó su espera mientras corrían backtests en paralelo y aprobó 2 de 2 al repetirla. Ver `artifacts/opt-2026-10-07/browser-all.txt`. Dos pruebas de momios ya fallaban antes de esta revisión (el commit `94687c0` cambió "Momio" por "Sin cuota publicada" sin actualizarlas, comprobado sobre el código original); se actualizaron a esa intención.
- Evidencia: `artifacts/opt-2026-10-07/backtest-football.json`, `backtest-football-espn.json` y sus `.txt`.

## 8. Límites (honestos)

- Ningún modelo garantiza resultados. Las probabilidades están bien calibradas en promedio, pero un partido concreto puede fallar.
- El modelo no conoce lesiones, alineaciones, rotaciones ni noticias.
- Córners y tarjetas no se pudieron comparar con cuotas de casas (ESPN no las publica); su validación es contra resultados reales.
- La calibración por tramos del pick se midió en cinco ligas europeas; en Liga MX y MLS se comprobó la mejora relativa, con muestras más pequeñas.
- Tras desplegar, hay que reactivar la base de Upstash (si sigue suspendida) y vigilar su consumo durante unos días.
