# Mercados, fuentes y auditoría de probabilidades — 5 de octubre de 2026

Cambios preparados para la web [Picks777](https://picks777.vercel.app), incluyendo frontend y API. El despliegue se comprueba con el estado de Vercel para el commit publicado y con el hash del archivo JavaScript servido. La evidencia posterior al despliegue se guarda en `artifacts/sports-production-verification-2026-10-05.json`.

## Funciones incorporadas

- Fútbol: córners totales 5.5, 6.5, 7.5, 8.5 y 9.5; tarjetas **amarillas** totales 2.5, 3.5 y 4.5, con más/menos por línea.
- Liga MX Femenil: apartado `/femenil`, calendario, clasificación e informes separados del fútbol masculino.
- Béisbol: MLB, NPB, KBO y LMB; ganador, anota al menos una carrera (sí/no), carreras por equipo 1.5–5.5, primer inning 1X2 con empate y total combinado de innings 1–5 de 1.5–5.5.
- Tenis: Wimbledon, Open de Australia, Roland Garros, Abierto de Estados Unidos, ATP y WTA. Individuales: ganador, primer set, segundo set y gana al menos un set (sí/no) por jugador.
- Básquetbol de Estados Unidos: NBA, pretemporada NBA, NCAA femenina y WNBA. Ganador y hándicaps +1.5 a +7.5 y −1.5 a −6.5 por equipo.

Los apartados incluyen filtros, búsqueda, fecha, resultados, actualización periódica, estados vacíos y errores de cobertura con reintento.

## Procedencia y actualidad

| Datos | Fuente consultada | Límite de la integración |
|---|---|---|
| Fútbol masculino y Liga MX Femenil | ESPN, calendarios, standings y boxscores | Feed público sin SLA; falta de métricas conserva N/D |
| MLB y LMB | [MLB Stats API](https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-10-01&endDate=2026-10-05&hydrate=linescore); LMB usa sportId 23 y liga 125 | Depende de la publicación y actualización del proveedor |
| NPB | [Calendario oficial](https://npb.jp/bis/eng/2026/games/gm20261005.html) y tablas de innings de cada encuentro | Calendario y finales disponibles; marcador en vivo no verificado |
| KBO | [Calendario oficial](https://eng.koreabaseball.com/Schedule/dailyschedule.aspx) | Marcador en vivo y detalle de innings no verificados aquí |
| Tenis y básquetbol | ESPN, resultados y cuotas cuando están publicadas | Sin cobertura garantizada de todos los encuentros o mercados |

Se consultaron proveedores reales y se contrastaron 16 informes de fútbol con sus registros de origen. Liga MX Femenil, MLB, NPB, KBO, ATP/WTA y pretemporada NBA devolvieron encuentros; LMB devolvió un calendario válido sin encuentros en el periodo publicado. No se reemplaza una liga vacía con encuentros de demostración.

Los feeds deportivos nuevos se sondean cada 60 segundos mientras la página está visible; fútbol sincroniza cada 25 segundos. La caché de calendarios actuales dura 60 segundos y la del feed calculado de nuevos deportes 15 segundos. Pueden acumularse estos intervalos más el retraso del propio proveedor. Standings y resultados históricos terminados tienen cachés más largas. **Hora de consulta no significa hora de actualización del proveedor; no se garantiza tiempo real instantáneo.**

NPB/KBO anuncian la ausencia de marcador en vivo verificado. Un resultado numérico KBO del mismo día no se interpreta automáticamente como final. Si falla el proveedor, se muestra la incidencia; la lista no mantiene probabilidades anteriores presentadas como una consulta nueva. Ningún módulo de producción importa los archivos locales de encuentros, resultados o clasificaciones de demostración.

## Correcciones de veracidad

- Los goles históricos se cuentan con marcadores reales, independientemente de la disponibilidad de mitades, córners o tarjetas. Una mitad ausente no se convierte en cero goles ni otra métrica determina el número de partidos observados.
- Se detectaron bloques ESPN completamente en cero en Liga MX Femenil, incluidos pases, posesión y tiros pese a tener goles. Esos bloques se descartan como estadísticas incompletas, conservando el marcador válido. Un cero individual dentro de un bloque informado sigue siendo una observación válida.
- Las clasificaciones actuales de un partido finalizado no se usan para reconstruir su supuesto pronóstico previo. El historial excluye el partido analizado y resultados posteriores al inicio.
- La sincronización conserva la autoridad del proveedor sobre marcador, minuto, cuotas, modelo y fecha de consulta. Se invalidaron cachés antiguas y se redujo la caducidad de informes: 5 minutos programados, 30 segundos en vivo y 1 hora finalizados.
- Primer inning y F5 de béisbol requieren anotaciones reales del periodo; se eliminó la aproximación de dividir las carreras completas entre nueve. Si no hay al menos cinco observaciones por equipo, el mercado muestra N/D.
- Los innings NPB comprueban URL del encuentro, identidad de ambos equipos, orden de las filas y suma de carreras contra el marcador final. Los escudos del encabezado pueden listar primero al ganador y no determinan local/visitante.
- La IA generativa solo elige identificadores de hechos existentes en el catálogo. Sus números, cuotas, selecciones y texto libre no reemplazan los cálculos o registros del servidor. Respuestas sin identificadores válidos no se anuncian como análisis realizado por IA.
- Se retiraron mensajes de “pronóstico confirmado”, “profundidad confirmada” y porcentajes presentados como precisión. Las solicitudes IA tienen un presupuesto de tiempo acotado al límite del despliegue.

## Métodos y coherencia

Todos los porcentajes son **estimaciones previas al partido**, aunque el calendario muestre un encuentro en vivo. No son resultados observados ni probabilidades condicionadas al marcador actual.

Fútbol calcula goles, córners y tarjetas mediante Poisson sobre estadísticas disponibles, exigiendo la muestra declarada. Las alternativas a partir de cuotas completas están identificadas. Las tasas históricas de porterías a cero y ambos anotan quedan N/D si no existen observaciones suficientes; no se fabrican a partir del propio modelo.

Béisbol usa hasta 20 resultados terminados anteriores por equipo, mínimo cinco. La fuerza relativa Elo parte de un prior matemático neutral de 1500, escala 400 y K=24; ese prior no se publica como clasificación observada. El reparto Poisson de carreras se ajusta a esa fuerza preservando el total esperado. NPB/KBO estiman por separado la frecuencia de empate final con suavizado declarado; MLB/LMB condicionan el ganador al desenlace decisivo. Los totales por equipo incluyen las entradas extra presentes en los resultados de origen. Primer inning y F5 se estiman exclusivamente con los registros reales de esos periodos.

Tenis usa cuotas completas normalizadas sin margen o fuerza relativa Elo de resultados anteriores del mismo circuito, con mínimo cinco partidos y cinco sets observados por jugador. La probabilidad de cada set se obtiene del ganador bajo un modelo de sets independientes e idénticos; por eso primer y segundo set pueden tener la misma estimación. Se distingue el formato por torneo, circuito y ronda. No se calculan dobles ni se usan retiros como partidos completos.

Básquetbol usa la distribución normal del margen observado en la misma competición, con mínimo cinco encuentros por equipo y variación real. Cuando existen cuotas completas, se centra la distribución para que el ganador coincida con su probabilidad implícita sin margen. Pretemporada se mantiene separada y puede consultar las dos temporadas anteriores.

La auditoría comprueba rango 0–100, suma de resultados mutuamente excluyentes, complementos sí/no y más/menos, monotonía de líneas, signos y complementos de hándicaps, relaciones entre ganador y gana un set, fuentes, fechas y reproducción de estadísticas. La ejecución completa y sus muestras están en `artifacts/sports-deep-audit-2026-10-05.json`; el script reproducible es `scripts/audit-sports-truthfulness.mjs`.

## Calidad predictiva: resultados y límites

Prueba retrospectiva exploratoria, con registros del proveedor disponibles al consultar. Se excluyen el encuentro objetivo, resultados posteriores, empates en la evaluación binaria y cuotas actuales. **No son pronósticos archivados antes de cada encuentro, un conjunto ciego ni una validación prospectiva.** Se revisaron estos resultados para orientar correcciones del modelo, lo que impide tratarlos como evidencia independiente de rendimiento futuro.

| Competición | Encuentros evaluables | Brier | Aciertos retrospectivos del favorito |
|---|---:|---:|---:|
| MLB | 450 | 0.2500 | 52.0 % |
| LMB | 13 | 0.2329 | 61.5 % |
| KBO | 89 | 0.2400 | 64.0 % |
| NPB | 50 | 0.2525 | 48.0 % |
| WTA | 210 | 0.2493 | 55.2 % |
| ATP | 107 | 0.2434 | 58.9 % |
| Abierto de Estados Unidos | 95 | 0.2377 | 56.8 % |
| WNBA | 303 | 0.2133 | 69.0 % |
| Pretemporada NBA | 24 | 0.2701 | 58.3 % |

Brier mide el error cuadrático de las probabilidades binarias: menor es mejor; una estimación fija de 50/50 obtiene 0.25. NPB y pretemporada NBA no superan esa referencia en estas muestras. LMB y pretemporada tienen muy pocos casos. Los aciertos no validan por sí solos la calibración, rentabilidad ni una probabilidad concreta del siguiente encuentro.

En la comparación con la versión anterior sobre encuentros elegibles comunes, el ajuste redujo Brier en las cuatro ligas de béisbol y WTA; ATP quedó prácticamente igual y el Abierto de Estados Unidos empeoró. La comparación completa, incluyendo el tramo cronológico final, está en `artifacts/relative-strength-comparison-2026-10-05.json`. No se afirma mejora uniforme en tenis.

No hubo una muestra histórica de fútbol utilizable para estimar aciertos de sus nuevos mercados mediante la consulta por rango. Sí se verificaron sus fuentes, registros y coherencia matemática. Tampoco se validó predictivamente cada línea de córners, tarjetas, carreras, innings, sets o hándicaps. Faltan validación prospectiva y variables como lanzadores, alineaciones, lesiones y superficie. La interfaz explica estas limitaciones y no garantiza ganancias ni porcentajes de acierto.

## Pruebas de software y publicación

| Comprobación | Resultado |
|---|---|
| `npm test` | 152 aprobadas, 0 fallos |
| Suite completa de navegador: Chromium, WebKit y Firefox | 156 aprobadas, 0 fallos |
| `npm run lint` | Sin errores |
| `npm run build` | Aprobada; aviso sobre tamaño del paquete principal |
| `npm run test:offline` | Navegación sin conexión aprobada; solo se almacena offline.html |
| Auditoría de datos y matemáticas | 9.739 comprobaciones aprobadas en la última ejecución; evidencia JSON con muestras y limitaciones |

Las pruebas automatizadas usan fixtures aislados para autenticación, UI y fallos; esos fixtures no se sirven como datos de producción. La auditoría de proveedores consulta servicios reales sin credenciales de producción ni modificaciones de usuarios.

La comprobación del despliegue es de lectura, incluye las cinco rutas, salud de API/Redis, protección de todos los feeds deportivos y coincidencia del bundle publicado. La sesión disponible del navegador no estaba autenticada: la comprobación privada con un usuario real en producción no forma parte de esta evidencia. Los flujos autenticados se verificaron con pruebas aisladas, y las fuentes reales se auditaron directamente desde los servicios del proyecto.
