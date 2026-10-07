# Corrección de probabilidades — 6 de octubre de 2026

La captura revelaba dos problemas reproducibles en el motor de béisbol: el ganador ignoraba las cuotas publicadas y las carreras usaban Poisson con una dispersión demasiado pequeña para los marcadores observados. La hidratación añadía momios sin recalcular el ganador, mientras el calendario y Banqueros seguían usando el cálculo anterior.

Con los momios exactos de la captura (Padres −138; Brewers +114), la normalización de ambas probabilidades implícitas da **55,4% / 44,6%**. Una prueba reproduce esa combinación incluso cuando el historial favorece ampliamente a Brewers. Con los momios reales consultados durante esta revisión (−144 / +119), el mismo partido muestra **56,4% / 43,6%**. Ambos cálculos son referencias de mercado sin margen; no se presentan como una predicción independiente ni como una garantía de acierto.

El ganador de mercado requiere ambas cuotas de una misma casa y una misma estructura de datos. Se conserva la coincidencia exacta de participantes, local/visitante y horario para impedir cruces entre dobles jornadas. Una cuota parcial no completa su contraparte con un precio de otra estructura. Si faltan ambas cuotas, el informe identifica explícitamente la estimación histórica.

Las carreras por equipo, los totales completos, el primer inning y los primeros cinco innings usan ahora distribuciones binomiales negativas. Las medias proceden de anotación propia y carreras recibidas por el rival; la dispersión incorpora la variación observada, como mínimo la de Poisson, más la incertidumbre de estimar medias con muestras finitas. Los encuentros comunes añaden covarianza al error de la media y no se cuentan como dos observaciones independientes. Los totales son la convolución de ambos equipos bajo independencia. El modelo conserva al menos 99,999999% de la masa antes de admitir una distribución; no convierte una cola recortada en certeza.

Se mantienen los mínimos de cinco resultados por equipo y veinte resultados como máximo. Los registros de innings duplicados o incompatibles con el marcador final se excluyen. Las muestras completamente nulas conservan su tamaño observado pero indican N/D para la predicción: seis innings sin carreras no justifican un empate o Under futuro de 100%. La frecuencia suavizada de extra innings conserva sus verificaciones anteriores.

El calendario, el ranking y el detalle calculan con las mismas cuotas y comparten una versión del modelo. Las cachés del servidor y el almacenamiento de detalles del navegador cambian de versión para invalidar informes del motor anterior. La interfaz distingue mercado sin margen de estimación histórica y permite leer la línea completa del total de cinco innings en pantallas pequeñas.

## Comprobación con resultados reales

`node --import ./tests/setup.js scripts/audit-baseball-probabilities.mjs` consulta MLB Stats API y ESPN sin modificar cuentas ni enviar solicitudes de IA. Reproduce cada encuentro con resultados finalizados cuya hora de inicio es anterior a la del encuentro analizado. Compara los totales anteriores de Poisson y los nuevos manteniendo las mismas medias esperadas.

La ventana disponible contiene 497 encuentros finalizados; 421 tienen la muestra exigida. Para Over 2.5 en los primeros cinco innings:

| Medida (menor es mejor) | Anterior | Corregido |
| --- | ---: | ---: |
| Brier | 0,214691 | 0,196718 |
| Pérdida logarítmica | 0,664226 | 0,583499 |

El Brier disminuye un 8,4% en esta muestra. Las cinco líneas de F5 mejoran ambas medidas. En totales completos, ocho de nueve líneas mejoran Brier; 4.5 empeora ligeramente (0,114701 → 0,114797). Todas mejoran pérdida logarítmica. El informe conserva también los grupos de calibración, incluidos aquellos que todavía sobreestiman resultados.

En Padres–Brewers, Over 2.5 de F5 pasa de 94% a aproximadamente **82,1%**, incorporando la incertidumbre de enfrentamientos compartidos. El script comprueba que calendario, Banqueros y detalle tienen análisis idénticos en los cuatro encuentros próximos examinados.

Esta revisión retrospectiva cubre una ventana corta, no una temporada externa de validación. No incorpora cuotas históricas archivadas, lanzadores, alineaciones o lesiones. La selección temporal utiliza fechas de inicio; la fuente no conserva aquí la hora histórica de disponibilidad de cada resultado, lo que limita el replay de encuentros suspendidos o reanudados. No acredita una precisión prospectiva ni superioridad sobre proveedores externos. El nuevo cálculo sigue suponiendo independencia del marcador de ambos equipos.

Evidencia: `artifacts/probability-validation-2026-10-06.json`, los informes antes/después y las pruebas de regresión en `tests/probability-reliability.test.js`. La suite completa aprueba 181 pruebas; lint y compilación aprueban. Nueve pruebas finales de navegador aprueban en Chromium, WebKit y Firefox, comprobando cuotas, favorito, etiquetas, lectura de líneas y desbordamiento a 320 px. La compilación conserva el aviso existente de tamaño de un paquete JavaScript superior a 500 kB.

Referencias matemáticas: [formatos de cuotas de The Odds API](https://the-odds-api.com/sports-odds-data/odds-format.html) y [binomial negativa en la documentación oficial de R](https://stat.ethz.ch/R-manual/R-patched/library/stats/help/rnbinom.html).

## Verificación adicional antes de publicar

Tras la autorización del propietario se ejecutó una nueva auditoría real de IA. Entre las 22:32:03 y las 22:32:29 del 6 de octubre, hora de Santiago, se observaron cinco llamadas HTTP nuevas al proveedor configurado, con `deepseek-v4.1`, para cuatro encuentros de fútbol, béisbol, tenis y básquetbol. Todas las respuestas aceptadas conservaron exactamente las probabilidades y seleccionaron hechos existentes en el catálogo. En tenis faltaba la muestra mínima de una jugadora y la IA conservó N/D, sin inventar porcentajes. Fútbol necesitó dos solicitudes para obtener una selección válida. Evidencia: `artifacts/probability-fix-real-ai-2026-10-06.json`.

`scripts/verify-baseball-source-records.mjs` contrastó 38 resultados distintos con los endpoints oficiales de cada encuentro de MLB: marcadores finales, todos los innings y última entrada. Los datos coincidieron; el total F5 se recalculó desde esas consultas independientes y coincidió con el de la aplicación. Evidencia: `artifacts/probability-source-verification-2026-10-06.json`.

Estas comprobaciones acreditan consistencia con las fuentes revisadas, no ausencia absoluta de errores dentro de ESPN/MLB ni precisión futura. La IA prioriza hechos; no investiga noticias ni sustituye el motor estadístico.

El propietario autorizó expresamente la publicación de esta corrección.
