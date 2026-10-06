# Carga, conservación de informes y rendimiento en todos los deportes

Los informes completados se conservan al cambiar entre fútbol, béisbol, tenis y básquetbol. En los tres últimos deportes se guardan también en IndexedDB, separados por cuenta y deporte, para recuperarlos después de recargar el navegador. En fútbol se conserva el almacenamiento de informes existente y se amplía su capacidad. Una solicitud interrumpida al salir deja de bloquear su reintento al volver.

Un informe previo al partido puede conservarse durante 24 horas si sus entradas coinciden. Un cambio real de participante, fecha, estado, marcador, cuota o cálculo estadístico invalida el informe correspondiente. Los encuentros en vivo y los programados cuya hora ya pasó conservan la caducidad breve. No se prolongan datos deportivos en vivo durante 24 horas.

## Carga y rendimiento

- Las estadísticas de todo el calendario se consultan al entrar al deporte, independientemente del desplazamiento, las tarjetas visibles y los filtros.
- Las consultas usan lotes limitados, una actualización del calendario por lote y almacenamiento asíncrono. Consultar estadísticas o recuperar un informe guardado no llama al proveedor de IA.
- Cada lote resuelve sus identificadores contra el calendario del servidor. Los resultados suministrados por el navegador no entran en el cálculo.
- Los informes de IA siguen usando el proveedor configurado y los controles exclusivos del Owner. La IA ordena hechos verificados y no reemplaza las probabilidades calculadas.
- Se comparten índices del historial y cálculos de fuerza relativa entre encuentros; las tarjetas evitan renders repetidos y el navegador omite el pintado de las que están fuera de pantalla.
- La compilación de estilos escanea el código de la interfaz, sin recorrer los informes y capturas acumulados en el proyecto.

Los calendarios siguen consultándose cada minuto mientras la página está visible. Los historiales de tenis se reutilizan durante 30 minutos. El proveedor puede publicar con retraso. Las probabilidades continúan siendo estimaciones previas al encuentro, no probabilidades ajustadas por el marcador en vivo.

## N/D y datos reales

La consulta de tenis que cruzaba dos años devolvía una cobertura incompleta de ESPN. Ahora se divide por temporada y utiliza hasta 365 días de encuentros publicados. El calendario inicial usa un intervalo corto independiente del historial completo; los datos se completan en segundo plano. Se excluyen oponentes aún por definir de las solicitudes de análisis.

La auditoría realizada entre las 23:05:37 y las 23:05:53 UTC del 5 de octubre revisó seis encuentros reales: dos de WTA, dos de MLB y dos de pretemporada NBA. Comprobó historiales anteriores al encuentro, muestras mínimas, porcentajes entre 0 y 100, suma del ganador, complementos Over/Under y coherencia de las líneas disponibles. No utilizó llamadas de IA de pago ni respuestas deportivas preparadas.

Los dos casos de tenis señalados ahora cuentan con muestras suficientes: Guo Hanyu–Aliona Falei, 20 y 18 partidos; Moyuka Uchijima–Bai Zhuoxuan, 20 y 19. Sus porcentajes se calculan desde esos datos. Cuando faltan cuotas completas, resultados o innings verificables, se mantiene N/D y se informa la limitación. No se inventan porcentajes para eliminar ese estado.

Evidencia reproducible: `scripts/verify-sports-loading-live.mjs` y `artifacts/sports-loading-live-2026-10-05.json`. La evidencia recoge el momento de consulta, la fuente, sus enlaces, muestras y metodología. Valida trazabilidad y coherencia, sin acreditar calibración o aciertos futuros.

## Pruebas

- La suite unitaria completa aprueba 174 pruebas. Incluye conservación de 900 informes, invalidación por cambios deportivos y por cuenta, respuesta tardía de IA, lotes autenticados, separación de temporadas, comparación del cálculo optimizado con una implementación independiente y reintento de una selección de hechos demasiado extensa.
- Lint y compilación de producción aprueban. Continúa el aviso de tamaño del paquete principal de Vite.
- La regresión de diseño, mercados, momios, filtros, Banqueros y permisos aprueba 48 casos en Chromium, WebKit y Firefox.
- Las pruebas de carga usan 240 encuentros por deporte y 180 informes completados: cargan las tarjetas fuera de pantalla, conservan el contador después del sondeo y la navegación, y recuperan los informes tras una recarga real. También comprueban que la búsqueda responde en menos de un segundo dentro del navegador y que estas operaciones no llaman a IA de pago.
- Fútbol comprueba que el primer informe no se repite al salir, que la segunda solicitud interrumpida se reintenta al regresar y que cambiar una cuota retira el distintivo del informe anterior.

Las pruebas de navegador usan cuentas y respuestas aisladas que nunca se sirven en producción. La carga se comprueba sobre la compilación de producción con `playwright.production.config.js`, evitando que la instrumentación de React en desarrollo distorsione las mediciones. Las pruebas funcionales habituales conservan su configuración de desarrollo.

La ronda pesada inicial de Firefox tuvo demoras de instrumentación; en la compilación, el service worker interceptó las respuestas aisladas durante la recarga. La configuración de pruebas bloquea ese service worker para mantener el aislamiento de la API, siguiendo la [documentación de Playwright](https://playwright.dev/docs/network#missing-network-events-and-service-workers). La revisión final de Firefox aprueba sus cuatro casos. La comprobación de fútbol mantiene una solicitud pendiente durante la acción de detener, para que las respuestas instantáneas de prueba no terminen la cola antes de una interacción lenta de WebKit. Estas correcciones afectan a las pruebas y no cambian el service worker publicado ni relajan las comprobaciones de datos y persistencia.

`scripts/verify-sports-deployment.mjs` comprueba la publicación de forma anónima, incluidos el hash del paquete publicado, el estado del servidor y la protección de las nuevas consultas por lotes. No crea cuentas ni cambia credenciales de producción.

La comprobación adicional del 6 de octubre observó cuatro respuestas HTTP nuevas del proveedor de IA, una por deporte, con el modelo configurado y sin informes de IA en caché. Su alcance y evidencia se describen en `VALIDACION-IA-REAL-2026-10-06.md`.

Los navegadores y servidores de prueba se cierran al finalizar. Los archivos de evidencia permanecen guardados y no mantienen procesos activos.
