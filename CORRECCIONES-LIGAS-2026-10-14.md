# Correcciones de ligas — 14 de octubre de 2026

Regla del dueño: los porcentajes salen solo del modelo propio. Los momios de las casas se muestran aparte y aquí se usan únicamente para medir la distancia; nunca entran en el cálculo.

Todas las cifras son de prueba a ciegas. Los parámetros se eligieron con temporadas anteriores y se midieron en una temporada que el modelo no vio.

## Béisbol de Japón (NPB) y Corea (KBO)

**Qué estaba mal:**
- **NPB:** usaba solo los últimos 21 días. En octubre eso dejaba 8–10 partidos por equipo.
- **KBO:** la navegación al mes anterior del sitio oficial no enviaba la cookie de sesión, así que el historial quedaba incompleto.
- **Empate:** salía de los últimos partidos de los dos equipos. Un solo empate llegaba a dar 9–21% de probabilidad. En la realidad es del 2 al 3%.
- **Momio de 3 resultados:** el ganador se mostraba con 3 resultados (local, empate y visita), pero las casas ofrecen moneyline sin empate (si empatan, devuelven la apuesta). Por eso un partido parejo salía con un momio de +176 mientras la casa daba −110/−115.
- **Extra innings:** salía N/D en NPB y KBO.

**Arreglo:**
- **NPB:** temporada completa desde el calendario mensual oficial (npb.jp), más de 140 partidos por equipo.
- **KBO:** temporada completa desde la página oficial, con la sesión correcta.
- **Empate:** frecuencia de toda la liga en el último año. NPB 2024-26: 1.9–3.4%. KBO 2025-26: 2.5–3.2%.
- **Ganador:** se muestra como el moneyline de las casas (los porcentajes suman 100 y el empate devuelve la apuesta). La probabilidad de empate aparece aparte.
- **Extra innings:** calculado con 9 entradas reglamentarias.

| Prueba a ciegas | Acierto antes | Acierto ahora | Empate dicho → ocurrido (antes) | Empate dicho → ocurrido (ahora) |
|---|---:|---:|---|---|
| NPB 2026 (775 partidos) | 53.9% | **57.6%** | 3.5% → 1.9% (máx. 11.3%) | 2.0% → 1.9% (máx. 2.4%) |
| KBO 2026 (650) | 54.1% | **55.5%** | 3.6% → 2.5% (máx. 9.7%) | 2.9% → 2.5% (máx. 3.5%) |
| KBO 2025 (648) | 52.5% | **53.6%** | 4.4% → 3.2% (máx. 11.8%) | 3.5% → 3.2% (máx. 3.9%) |

Script: `scripts/backtest/experiment-asian-baseball.mjs`.

## MLB: lanzadores abridores

El modelo no conocía a los abridores. Ahora usa el FIP de cada abridor anunciado: jonrones, bases por bolas, golpeados y ponches por entrada de esta temporada y la anterior, contraído hacia la media de la liga.

| MLB 2026, a ciegas (2,100 partidos) | Antes | Ahora | Casa (ESPN BET) |
|---|---:|---:|---:|
| Acierto | 53.6% | **55.0%** | 57.7% |
| Log loss (menor es mejor) | 0.6872 | **0.6840** | 0.6754 |
| Diferencia media con la casa | 5.0 pts | **4.1 pts** | — |
| Mismo favorito que la casa | 72.9% | **77.9%** | — |

**Cambios relacionados:**
- **Historial al inicio de temporada:** el día inaugural usa también el final de la temporada anterior (240 días hasta mayo). Antes salía N/D las primeras semanas.
- **Spring training:** ya no cuenta para los ratings.

Script: `scripts/backtest/experiment-baseball-starters.mjs`.

## Básquetbol

**Sin cambios en la fórmula:** en la prueba a ciegas, el modelo con bajas y descansos iguala a la casa en los primeros 15 partidos de 2025-26 (log loss 0.5628 vs 0.5625). Acercar a la media de la liga los ratings de inicio de temporada no mejoró nada, así que no se aplicó.

**Lo que sí cambió:**
- **Si el historial de NBA/WNBA no está cargado:** la app espera hasta 20 segundos y, si aún no está, muestra "calculando" en lugar del método viejo de los últimos 20 partidos. Ese método llegó a dar LA Clippers 69% donde los ratings dan 27%.
- **Pretemporada:** los equipos sientan a sus titulares sin reportarlo. Ahora se cuenta que juega el 82% de los jugadores importantes, como en las pretemporadas 2023-25.
- **Diferencias que quedan:** en la pretemporada y en la primera semana siguen algunos partidos con 15–25 puntos de distancia con la casa, por ejemplo Dallas–New Orleans o Brooklyn–Charlotte. Son equipos que cambiaron mucho en el verano, y la casa sabe cosas que no salen en ningún dato público. Esos partidos muestran el aviso y no entran en Banqueros.

## Aviso cuando el modelo y la casa difieren mucho (todos los deportes)

- **Más de 12 puntos de diferencia:** la tarjeta dice que la casa puede tener información que el modelo no ve (lesiones, alineaciones, abridores, fichajes).
- **Más de 15 puntos:** el partido sale de Banqueros.
- **El porcentaje no cambia:** sigue siendo el del modelo propio.

## Listo para las próximas temporadas

- **NPB y KBO:** de enero a junio también usan el final de la temporada anterior. El juego de estrellas no cuenta.
- **MLB y LMB:** el día inaugural ya tiene historial (240 días) y spring training no cuenta.
- **NBA temporada regular:** usa ratings, bajas y promedios de la temporada en curso apenas empieza.
- **NCAA femenil:** mantiene su método propio.
- **Revisión automática:** 3,642 controles de coherencia en todas las categorías, 0 errores.
