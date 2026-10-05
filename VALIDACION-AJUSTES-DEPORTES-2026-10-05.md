# Ajustes de deportes, horarios, forma y momios

Las cuatro categorías son Fútbol, Béisbol, Tenis y Básquetbol. Liga MX Femenil aparece junto a Liga MX en el selector de fútbol y consulta su proveedor propio, ESPN `mex.w.1`. Se conserva `/femenil` como acceso directo, y la selección puede compartirse con `/?league=mexico_femenil`. Los filtros de fecha y búsqueda están debajo de las ligas, antes del destacado. Se retiraron los textos descriptivos de las cabeceras deportivas.

Tarjetas, destacado e informes muestran día y hora en la zona local del navegador. La fecha cambia correctamente al cruzar medianoche entre zonas. Si el proveedor no confirma la hora, aparece “Hora por confirmar”; no se presenta su hora de relleno como horario publicado.

Béisbol y básquetbol muestran los cinco resultados completos anteriores al encuentro de cada equipo en esa competición, del más antiguo al más reciente. Los registros se identifican por partido, excluyen el encuentro actual, fechas futuras, otros torneos y marcadores incompletos. El informe permite consultar rival, marcador, fecha con año y fuente. La muestra de pretemporada NBA puede incluir años anteriores y queda identificada por sus fechas.

Todos los deportes presentan probabilidad y momio. Los formatos Americano, Decimal y Fraccionario se aplican también a los nuevos mercados. “Publicado” identifica una cuota recibida de la fuente. “Teórico” significa `100 / porcentaje`, sin margen de la casa: no es una oferta publicada ni acredita precisión predictiva. N/D se conserva si faltan datos o no puede representarse una cuota válida. MLB incorpora cuotas ESPN solo cuando coinciden los dos equipos, su orientación y la hora de inicio, rechazando coincidencias duplicadas. Se usa el día del calendario de ESPN para los juegos nocturnos y se conserva el enlace y hora de consulta de las cuotas.

## Carga y sincronización

Béisbol y básquetbol consultan las ligas por separado y muestran cada respuesta al llegar. Un proveedor lento no oculta las otras ligas. El calendario de básquetbol no espera historiales de equipos ajenos al encuentro. En tenis se devuelve el calendario antes de calcular cientos de informes; los partidos visibles completan su análisis utilizando el historial real del circuito.

Las consultas tienen límite de tiempo y opción de reintento. Cambiar el formato de momios o volver a una pestaña visible no cancela una consulta activa. Se reutilizan respuestas recientes en memoria durante un minuto, separadas por sesión y deporte, conservando las horas originales de consulta. Los informes se invalidan cuando cambia el partido, fecha, estado, marcador o cuota. Se cancelan solicitudes al salir del apartado. La sincronización superior actualiza el deporte abierto.

Al integrar femenil en fútbol, la actualización conserva liga, fecha, estado, búsqueda y zona horaria; reemplaza el calendario con la respuesta vigente y cancela consultas del filtro anterior. Un fallo del proveedor de la liga seleccionada se comunica como error aunque otras ligas sigan disponibles. Se retiran sus encuentros anteriores y no se anuncia una sincronización exitosa cuando la consulta falla.

Medición local con servicios reales: el historial de tenis tardó 2.028 ms y calcular el feed completo otros 8.909 ms. Tras separar el análisis, el calendario tardó 1.956 ms y el informe del encuentro visible 435 ms. Son mediciones de una ejecución, no garantías de latencia para usuarios o proveedores.

## Evidencia

- Suite unitaria completa: 163 aprobadas, 0 fallos.
- Primera ronda de mercados en Chromium, WebKit y Firefox: 30 aprobadas, 0 fallos.
- Ronda ampliada con navegación y parlay en pantallas de 320 px y orientación horizontal: 38 aprobadas; un caso de navegación de Firefox agotó su tiempo. La revisión posterior de ese flujo, rachas, formatos y sincronización superior pasó 9 casos en los tres navegadores. Los tests esperan contenido visible de la aplicación, sin depender de completar recursos externos.
- Regresión final de fútbol en Chromium, WebKit y Firefox: 9 aprobadas, 0 fallos. Comprueba posición de filtros, recarga y navegación de femenil, actualización del calendario, retirada de encuentros ante un fallo del proveedor y ausencia de un aviso de éxito falso. El error de consulta también se anuncia a tecnologías de asistencia.
- Auditoría de servicios reales: 2.047 comprobaciones aprobadas, sin datos de demostración; evidencia en `artifacts/sports-display-live-verification-2026-10-05.json` y script `scripts/verify-sports-display-live.mjs`.
- Lint sin advertencias y compilación de producción aprobada. Persiste el aviso de tamaño del paquete principal.

Las pruebas de navegador y sesión usan cuentas y respuestas aisladas de prueba; esas respuestas no se sirven en producción. Las comprobaciones de datos consultan fuentes reales de MLB, NPB, KBO y ESPN. La revisión HTTP de producción es anónima y compara el JavaScript publicado con la compilación local, junto a salud de API/Redis y protección de rutas. No se modifican usuarios ni credenciales de producción. No se afirma una verificación autenticada nueva del sitio.

La coherencia matemática y la reproducción de resultados no validan calibración ni rentabilidad. Las limitaciones predictivas y la evaluación retrospectiva anterior están en `VALIDACION-MERCADOS-2026-10-05.md`. La hora de consulta no garantiza el instante de actualización del proveedor; las cuotas son snapshots informativos y su vigencia debe confirmarse en la casa.

Al finalizar se cierran los servidores y navegadores de pruebas. Se conservan informes y capturas como evidencia; esos archivos no mantienen procesos activos.
