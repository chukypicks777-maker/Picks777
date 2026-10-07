# Auditoría de probabilidades y momios — 7 de octubre de 2026

La revisión confirma errores de prioridad de fuentes y de presentación, y limitaciones del modelo. No encontré evidencia que permita afirmar que Picks777 predice mejor que las casas. Una cifra diferente no demuestra una ventaja. La IA actualmente ordena hechos; no produce los porcentajes ni decide las cuotas.

## Lens–Lyon: el cálculo era correcto, la referencia principal era débil

La ficha recibida de ESPN corresponde a Lens–Lyon del 9/10/2026, 18:45 UTC, con cuotas de DraftKings. Lens tenía 5 partidos, 9 goles anotados y 9 recibidos; Lyon, 5 partidos, 10 anotados y 2 recibidos. El modelo calcula las medias `(1,8 + 0,4)/2 = 1,1` para Lens y `(2,0 + 1,8)/2 = 1,9` para Lyon. La distribución Poisson da exactamente 21,707% / 22,263% / 56,030%.

El defecto consiste en presentar ese modelo pequeño por delante del mercado completo que ya había en el mismo registro. No incluye ventaja de local, dificultad de rivales, titulares, lesiones ni lanzadores en béisbol. Tampoco hay un calibrador que demuestre que sus porcentajes coinciden con frecuencias observadas.

| Referencia | Lens | Empate | Lyon |
|---|---:|---:|---:|
| Modelo anterior, cinco partidos por equipo | 21,7% | 22,3% | 56,0% |
| Cuotas publicadas en nuestra ficha | 2,40 | 3,85 | 2,70 |
| Esas cuotas, retirando proporcionalmente el margen | **39,80%** | **24,81%** | **35,38%** |
| Captura de otra web, origen desconocido | 43% | 26% | 31% |

La fórmula empleada para retirar margen es `p(i) = (1/cuota(i)) / suma(1/cuota(j))`. Es una referencia del mercado, no una probabilidad verdadera demostrada. La normalización proporcional tampoco corrige por sí sola el sesgo entre favoritos y no favoritos.

[SportyTrader](https://www.sportytrader.com/cotes/lens-lyon-8532677/) mostraba siete filas de casas para este mismo partido, con precios cercanos a 2,15–2,32 para Lens, 3,40–3,70 para empate y 2,55–2,65 para Lyon. Como comprobación concreta, una fila de 2,30 / 3,60 / 2,65 implica aproximadamente 39,9% / 25,5% / 34,6% sin margen. Favorece ligeramente a Lens. No usé una mezcla de mejores cuotas de distintas casas para fabricar una distribución. La consulta posterior no permite reconstruir el instante de las capturas.

El Over 1,5 de 80,085% sale de `1 − exp(−3) × (1+3)`. Es correcto bajo ese modelo; no equivale a 80 aciertos comprobados de cada 100. El marcador 1–1 solo reúne 10,4% de la masa: que sea el marcador individual más frecuente no contradice una suma mayor de todos los marcadores con victoria visitante. Tras la corrección, el marcador sigue identificado como escenario del modelo estadístico, separado del mercado 1X2.

## KT–Samsung: precio calculado y oferta real son cosas diferentes

El proveedor [KBO oficial](https://eng.koreabaseball.com/Schedule/dailyschedule.aspx) suministra calendario y resultados. Nuestra integración no recibe momios de KBO ni marcador en vivo verificado. No existe en esa ficha una cuota publicada +176: se generó al convertir la estimación de 36,2% en cuota justa.

| Cálculo de la captura | Resultado |
|---|---:|
| Cuota justa para 36,2% | `1/0,362 = 2,7624` decimal → **+176** americano |
| KT −110, probabilidad implícita con margen | 52,381% |
| Samsung −115, probabilidad implícita con margen | 53,488% |
| Margen conjunto de esos dos precios | 5,869 puntos porcentuales |
| Mercado de dos resultados, sin margen | **KT 49,48% / Samsung 50,52%** |
| Modelo de tres resultados de la captura | KT 56,8% / empate 7% / Samsung 36,2% |

Si una casa devuelve el importe cuando hay empate, la comparación requiere probabilidades condicionadas a que haya ganador. En la captura, Samsung sería `36,2/(100−7) = 38,92%`, cuota justa cercana a +157, y seguiría lejos del mercado de la casa. Esto es condicional a sus reglas: no conocemos el operador, si estaba en vivo ni sus condiciones de liquidación. No supuse esas reglas automáticamente.

El total 9,5 muestra otro matiz: Over −135 / Under +100 implica aproximadamente 53,46% para el Over sin margen, cercano al 53,1% de nuestro modelo. Por tanto, la captura no demuestra que absolutamente todos los cálculos fueran erróneos.

Corregí el recuento de empate para contar partidos únicos, incluso cuando un enfrentamiento aparece en las dos muestras. Se aplica suavizado de Jeffreys `(empates+0,5)/(partidos únicos+1)`, coherente con el tratamiento de frecuencias de extra innings. En el caso concreto hay 40 encuentros únicos y 2 empates; la estimación pasa a 57,4% / 6,1% / 36,5%. Sigue siendo experimental y no imita una casa. El cambio de ese caso proviene del suavizado; los duplicados no estaban presentes en sus 40 registros.

La tarjeta ahora indica **“Sin cuota publicada”**. Los precios justos solo aparecen en el análisis como **“Precio del modelo — No ofrecido por una casa”**. Un precio de dos resultados no se adjunta a una probabilidad incondicional de tres resultados. Si llegan tres cuotas completas compatibles, se puede usar el mercado sin margen.

## Fuentes contrastadas

Revisé más de diez fuentes relevantes. No obtuve diez cotizaciones directas, sincronizadas y verificables de las mismas casas para los dos partidos; eso requeriría acceso a sus feeds o capturas identificadas. La tabla diferencia lo que pude comprobar de lo que no se puede concluir.

| Fuente y enlace | Qué aporta a la revisión | Límite |
|---|---|---|
| [ESPN, Lens–Lyon](https://www.espn.com/soccer/match/_/gameId/401876447) | Identidad del encuentro; nuestra respuesta de producción identifica cuotas DraftKings y datos de temporada. | Hora de consulta no confirma hora de actualización del precio; no es consenso de casas. |
| [KBO oficial](https://eng.koreabaseball.com/Schedule/dailyschedule.aspx) | Calendario, rivales y resultados que alimentan la aplicación. | Esta integración no suministra cuotas ni seguimiento en vivo. |
| [DraftKings](https://sportsbook.draftkings.com/sports/baseball) | Fuente de ofertas deportivas y operador identificado en el registro de fútbol. | La página pública consultada no proporcionó la pareja exacta KT–Samsung para verificar la captura. |
| [Pinnacle, calculadora de margen](https://www.pinnacle.com/betting-resources/en/betting-tools/margin-calculator) | Conversión y separación del margen para mercados de dos y tres resultados. | No demuestra que una cuota concreta sea precisa ni que nuestra app supere al operador. |
| [Betfair, reglas de béisbol](https://support.betfair.com/app/answers/detail/exchange-baseball-rules/) | Las reglas incluyen béisbol coreano y japonés; hay que comprobar el mercado y su liquidación. | No identifica la casa de la captura. Exchange y sportsbook tampoco son intercambiables. |
| [Smarkets, conceptos de apuestas](https://help.smarkets.com/hc/en-gb/sections/360003674031-Trading-and-Betting-Basics) | Interpretación de cuotas y probabilidades; en una bolsa puede intervenir comisión. | No obtuve una oferta específica de los partidos. |
| [Sofascore, cuotas e historial](https://www.sofascore.com/news/how-to-calculate-the-chance-of-winning-a-guide-to-football-odds-and-historical-performance?amp=1) | Distingue factores como localía, adversarios, jugadores y variación de cuotas. | Una explicación general no valida nuestra precisión ni identifica el 43/26/31. |
| [Forebet, metodología](https://www.forebet.com/en/what-is-forebet) | Declara utilizar historial y algoritmos; es una estimación independiente. | No encontré una probabilidad numérica del mismo partido y momento que permita certificar cuál acierta más. |
| [Opta Analyst](https://theanalyst.com/articles/opta-football-predictions) | Explica que combina cuotas del mercado con Opta Power Rankings. | Consultar su método no concede sus datos ni demuestra superioridad en estos dos partidos. |
| [SportyTrader, Lens–Lyon](https://www.sportytrader.com/cotes/lens-lyon-8532677/) | Varias filas de cotizaciones del encuentro actual respaldan una ventaja pequeña para Lens. | Agregador: no se verificaron simultáneamente las ofertas en cada cuenta ni en el instante de las capturas. |
| [Betimate, béisbol](https://betimate.com/en/baseball-predictions) | La búsqueda del encuentro mostraba un pronóstico propio 52/48 para KT–Samsung. | Pronóstico de otro modelo, no una cuota ni un backtest comparable; no se integró en producción. |
| [OddsDigger, béisbol](https://oddsdigger.com/baseball) | Publica precios de dos resultados para el encuentro. | Aparecían entradas invertidas y horarios diferentes; no es una fuente suficiente para importarlas automáticamente. |
| [Football-Data, notas del archivo](https://football-data.co.uk/data.php) | Explica apertura/cierre y advierte de precios Pinnacle desactualizados desde julio de 2025. | No entrené ni recopilé automáticamente sus archivos para el proyecto: sus condiciones restringen ese uso. |

No se eligieron por un supuesto ranking de “las mejores diez”. Se eligieron para comprobar fuentes oficiales, precios, reglas, modelos y calidad de datos. Las discrepancias entre páginas requieren comprobar fecha, local/visitante, período y condiciones; hacer una votación entre diez porcentajes no calibra un modelo.

## Comprobación histórica reproducible

Se ejecutó una reconstrucción cronológica sin ajustar parámetros sobre la muestra de evaluación. Para fútbol se utilizaron archivos de resultados de [OpenFootball, dominio público](https://github.com/openfootball/football.json), temporada 2025–26, de cinco ligas. Se excluyeron registros sin resultado y todos los resultados del mismo día del partido evaluado; mínimo cinco encuentros anteriores por equipo. Los archivos están incompletos respecto del calendario completo de esas ligas, por lo que las cifras solo describen los encuentros disponibles. Para béisbol se usó la ventana oficial que ya consulta la aplicación, con días anteriores y los últimos veinte partidos por equipo.

| Modelo histórico, selección de resultado más probable | Evaluados | Aciertos | Fallos | Aciertos |
|---|---:|---:|---:|---:|
| Fútbol, cinco ligas en conjunto | 1.386 | 730 | 656 | **52,7%** |
| Ligue 1 | 237 | 123 | 114 | 51,9% |
| Premier League | 298 | 146 | 152 | 49,0% |
| Bundesliga | 247 | 138 | 109 | 55,9% |
| LaLiga | 314 | 155 | 159 | 49,4% |
| Serie A | 290 | 168 | 122 | 57,9% |
| KBO, ganador de tres resultados | 102 | 61 | 41 | **59,8%** |
| MLB, ganador de dos resultados | 421 | 219 | 202 | **52,0%** |
| KBO, selección Over/Under 9,5 más probable | 102 | 44 | 58 | **43,1%** |
| MLB, selección Over/Under 9,5 más probable | 421 | 247 | 174 | **58,7%** |

Los resultados incluyen Brier, pérdida logarítmica y grupos de fiabilidad en `artifacts/probability-reliability-2026-10-07.json`. [La documentación de calibración](https://scikit-learn.org/stable/modules/calibration.html) explica por qué conviene evaluar fiabilidad y discriminación, además del porcentaje de ganadores. Brier menor, por sí solo, tampoco demuestra mejor calibración.

Estas pruebas evalúan el modelo histórico, **no prueban una mejora del nuevo criterio de mercado**, porque no tenemos precios históricos guardados con fecha de actualización para los mismos partidos. Tampoco son aciertos de una IA: esta no modifica las cifras. Las ventanas son retrospectivas, la de béisbol es pequeña, y no incluyen titulares, lanzadores ni xG. No permiten afirmar que las casas sean vencidas o que el resultado futuro vaya a repetir esas tasas.

## Cambios y uso práctico

- Fútbol: el mercado 1X2 completo tiene prioridad; el Poisson se conserva por separado. Over/Under y BTTS reciben procedencia por mercado. Cuando se ajusta una escala de goles a un Over/Under publicado, se identifica como modelo derivado del mercado, sin atribuirle aciertos validados.
- Las cuotas se leen como un conjunto del mismo formato/proveedor; no se completan mezclando un cierre nuevo con precios antiguos de otro formato. Actualizar detalles vuelve a calcular la referencia. Al pasar a vivo o finalizado, no se fabrica un nuevo pronóstico previo con cuotas o clasificación actuales.
- KBO: empate sin duplicados, distinción de dos/tres resultados, ausencia de cuota publicada explícita. N/D se conserva donde faltan innings verificables.
- IA: conserva el contrato de seleccionar IDs de hechos. Porcentajes, precios y selección principal proceden de los datos actuales; se invalidan informes antiguos al cambiar la versión del modelo. Se verificó con respuestas maliciosas simuladas que cifras inventadas no entran al informe.
- Las combinadas con precios teóricos indican que el retorno es una simulación. Un precio justo calculado como `1/p` no demuestra una apuesta de valor: su valor esperado sería cero por construcción, antes de errores del modelo.
- La investigación y el backtest se ejecutaron localmente, sin llamadas a IA de pago ni credenciales Redis. No se contrató otro proveedor de cuotas ni se añadió un barrido automático de diez webs por usuario.

Para buscar más aciertos que fallos de forma sostenible hay que guardar pronósticos antes de cada partido, medirlos después por deporte/mercado y comprobar que los grupos 60%, 70% u 80% se comportan así en muestras nuevas. Un porcentaje de aciertos alto tampoco garantiza beneficio: con cuota 1,05 se necesita aproximadamente 95,24% para no perder dinero en promedio. No hay base para vender actualmente Picks777 como superior a las casas ni para prometer más de 50% en todos sus mercados.
