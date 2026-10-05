# Diseño de deportes, Top 10 de ganadores y conexión con IA

Béisbol, tenis y básquetbol usan tarjetas compactas con la superficie, jerarquía y distribución de fútbol: liga y estado, día y hora local, identidades en filas, porcentajes y momios, barra de ganador, tres mercados propios del deporte y un pronóstico destacado. Béisbol y básquetbol conservan los resultados anteriores y los informes completos. Toda la tarjeta abre el detalle; las acciones del Owner tienen un área independiente.

Las imágenes se toman de los registros del proveedor. En tenis se usa el retrato cuando está publicado; si falta, se muestra la bandera del país proporcionada por ESPN, identificada como bandera. Si falla una imagen y su alternativa, aparecen las iniciales reales del nombre. No se generan retratos, resultados ni cuotas para rellenar datos ausentes.

## Banqueros

Los nuevos deportes tienen las categorías Todos los Mercados y Banqueros. Banqueros ordena hasta diez selecciones de ganador, de mayor a menor probabilidad estimada, con rango visible. Excluye encuentros ya iniciados, cancelados, retiradas y probabilidades ausentes. Si hay menos de diez ganadores estimables, muestra solamente los disponibles.

El servidor calcula el ranking sobre todos los encuentros próximos publicados dentro del calendario de ocho días y aplica los filtros de liga, fecha y búsqueda. No depende de qué tarjetas se hayan abierto. En básquetbol completa los historiales necesarios antes de ordenar; un ranking incompleto por un fallo de consulta devuelve un error con reintento. El favorito usa su momio publicado cuando existe o la cuota teórica identificada como tal.

## IA y permisos

Los nuevos deportes comparten el proveedor y la configuración privada de fútbol. El Owner puede activar la revisión automática, detenerla o reintentar desde la tarjeta y el informe. Los botones y la cola son exclusivos del Owner; el servidor también rechaza reintentos forzados y cambios de modelo de usuarios sin ese rol.

Un cliente autenticado puede recibir el informe inicial al abrir el detalle. La lectura de un informe compartido no inicia una llamada al proveedor. Se reutilizan informes recientes solo cuando coinciden los datos deportivos, marcador, muestras y cuotas. Los cambios de apartado cancelan la cola y las solicitudes del navegador. Una respuesta antigua no sustituye un reintento más reciente con los mismos datos.

La IA selecciona y ordena identificadores de hechos de un catálogo construido en el servidor. Se rechazan hechos desconocidos, texto libre, números, noticias o selecciones inventadas. Las probabilidades y los momios permanecen en el cálculo estadístico: la IA no los modifica. La interfaz anuncia una respuesta confirmada solamente cuando el proveedor respondió y los hechos pasaron la validación. Un fallo conserva el informe estadístico y comunica la falta de resultado verificable.

## Comprobación con proveedores reales

La auditoría del 5 de octubre de 2026 realizó 23 comprobaciones aprobadas. Revisó 41 próximos encuentros de béisbol (38 estimables), 249 de tenis (45 estimables) y 44 de básquetbol (43 estimables), con los tres rankings ordenados y sin duplicados. Consultó MLB Stats API, NPB, KBO y ESPN a través de los servicios de datos de la aplicación.

El proveedor configurado respondió con el modelo solicitado `deepseek-v4.1` para un encuentro real de cada deporte. Se comprobó que los informes solo contienen hechos del catálogo y que sus porcentajes coinciden exactamente con los del modelo estadístico. Las dos imágenes publicadas de la muestra de tenis respondieron HTTP 200 y eran banderas de los países correspondientes.

Evidencia reproducible: `scripts/verify-sports-bankers-ai.mjs` y `artifacts/sports-bankers-ai-live-2026-10-05.json`. La primera consulta conjunta encontró una indisponibilidad temporal de ESPN; la ejecución secuencial completa posterior fue satisfactoria. No se sustituyó la fuente con datos preparados.

## Validación y límites

La suite unitaria completa aprobó 167 pruebas. Incluye permisos del servidor, ranking independiente de tarjetas, invalidación de informes y preservación de una respuesta nueva ante consultas anteriores. Lint y compilación de producción aprobaron; persiste el aviso del tamaño del paquete principal de Vite.

La regresión de mercados aprobó 36 casos en Chromium, WebKit y Firefox. La revisión de diseño, imágenes, Banqueros y permisos de IA aprobó otros 12 casos en esos navegadores. La primera revisión detectó un tamaño excesivo de las tarjetas que se corrigió; en la ronda final dos casos de Firefox agotaron el tiempo de navegación y se aprobaron al ejecutarlos por separado, esperando explícitamente la respuesta del calendario. Se revisaron capturas de escritorio y móvil, incluido un ancho de 320 px sin desbordamiento y el reemplazo de imágenes fallidas por iniciales.

Las pruebas de navegador usan respuestas y cuentas aisladas para revisar estados de error, permisos, interacción y diseño. No se sirven en producción. Las comprobaciones HTTP de publicación son anónimas y comparan los bytes publicados con la compilación local; no se afirma una nueva verificación autenticada de producción ni se modifican credenciales o usuarios.

Estas comprobaciones validan funcionamiento, trazabilidad y coherencia, sin acreditar precisión futura, calibración o rentabilidad. Los porcentajes son estimaciones previas al encuentro; no se recalculan por el marcador en vivo. La consulta se actualiza cada minuto y el proveedor puede publicar con retraso. Un momio teórico no es una oferta de una casa.

Al terminar se cierran los servidores y navegadores de pruebas. Los informes y capturas se conservan como evidencia; no mantienen procesos activos.
