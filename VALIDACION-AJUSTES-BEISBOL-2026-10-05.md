# Ajustes de béisbol y tarjetas deportivas — 5 de octubre de 2026

Se retiraron la descripción bajo el título de béisbol y los dos bloques de anota al menos una carrera. Las tablas de carreras por equipo y F5 usan las etiquetas Over/Under. Después de los dos equipos aparece “Totales extra innings”, con líneas 1.5–9.5 del total combinado durante todo el partido, incluidas entradas extra; no es exclusivamente lo anotado en entradas extra.

Al final del informe de béisbol, “¿Habrá extra innings?” abre un apartado Sí/No. La frecuencia se estima con hasta los últimos 20 partidos por equipo, mínimo cinco verificables por lado. Requiere duración reglamentaria del proveedor, último inning, secuencia completa, suma de carreras compatible con el marcador final y empate al finalizar la duración reglamentaria cuando hubo entradas extra. Solo considera encuentros de la misma duración y anteriores al analizado; no duplica enfrentamientos comunes. El suavizado de Jeffreys usa (casos + 0.5) / (partidos distintos + 1): es un parámetro matemático declarado, no partidos añadidos a la muestra. NPB/KBO conservan N/D para esta opción porque esta integración no ofrece duración reglamentaria verificada.

El total combinado usa la misma distribución Poisson de los totales por equipo, con sus medias de carreras anotadas y recibidas, incluidos extras presentes en los resultados. Los porcentajes están redondeados y su precisión predictiva no está validada.

Béisbol, tenis y básquetbol muestran Telegram, WhatsApp e Instagram en la cabecera, tomando los enlaces de la configuración existente de comunidades. Las tarjetas completas abren el análisis; el botón accesible sigue permitiendo abrirlo con Enter y cerrarlo con Escape.

## Comprobaciones

| Verificación | Resultado |
|---|---|
| Suite unitaria completa | 156 aprobadas, 0 fallos |
| Mercados deportivos en Chromium, WebKit y Firefox | 18 aprobadas, 0 fallos |
| Lint y compilación de producción | Aprobados; persiste el aviso sobre tamaño del paquete principal |
| Auditoría de nuevas probabilidades sobre MLB Stats API | 44 comprobaciones aprobadas |

Las pruebas de navegador cubren móviles, tablas nuevas, retirada de los bloques marcados, redes con enlaces configurados, clic fuera del botón del informe, teclado, cierre, errores del proveedor y reintento. Las pruebas matemáticas comprueban las nueve líneas, complementos, monotonía, muestras ausentes, partidos de siete y nueve innings, detalle incompleto, exclusión de resultados futuros y otras ligas, identidad única y prior declarado.

La auditoría reproducible `node scripts/verify-baseball-extra-innings.mjs` comprueba registros reales de MLB y LMB y guarda `artifacts/baseball-extra-innings-live-verification-2026-10-05.json`. MLB: Cleveland Guardians vs Chicago White Sox, 36 partidos distintos verificables, uno con extras, estimación suavizada 4.1 % / 95.9 %. LMB: un encuentro histórico de la última fecha disponible, 23 partidos anteriores distintos verificables, cuatro con extras, estimación 18.8 % / 81.2 %. Esos casos verifican el cálculo y la procedencia; no acreditan una tasa de aciertos futura ni cobertura de LMB en el calendario actual.

La publicación se verifica con el estado del commit en Vercel y `node scripts/verify-sports-deployment.mjs`, que compara el JavaScript servido con el archivo local y conserva su evidencia en `artifacts/sports-production-verification-2026-10-05.json`. Las 18 comprobaciones HTTP del despliegue pasaron. En el navegador de producción se comprobaron la cabecera y los enlaces nuevos; su sesión había caducado y no fue posible completar el acceso de Google mediante automatización. La verificación completa de los modales corresponde a las pruebas aisladas en los tres navegadores, y la verificación de las nuevas probabilidades a registros reales del proveedor. No se cambiaron credenciales ni usuarios.

Los servidores y navegadores de Playwright se cierran al terminar la suite. Después de verificar producción se cierran las pestañas creadas para la tarea y se limpia el estado de automatización; se conservan los informes y capturas de evidencia.
