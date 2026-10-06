# Parlay y análisis automático para miembros — 6 de octubre de 2026

Las tarjetas de béisbol, tenis y básquetbol ofrecen **Al Parlay** en el lugar del reintento de IA. Añaden el ganador mostrado al mismo boleto que fútbol, con su probabilidad y momio sin redondear. **En Parlay** permite quitarlo. El boleto conserva la selección al cambiar de deporte, y distingue momios publicados de precios teóricos, también al copiar el resumen.

El procesamiento automático está separado de la visibilidad del panel. Los usuarios con una sesión vigente reciben estadísticas e informes en el deporte abierto aunque el Owner no esté conectado. La cola recorre los encuentros próximos del calendario, independientemente del filtro, búsqueda o posición de desplazamiento, y reutiliza los informes válidos. La preferencia de pausa del Owner no desactiva el procesamiento de otros miembros. Las solicitudes de un miembro usan la configuración del servidor; no envían un modelo, clave o reintento forzado.

El panel de administración de IA y los botones de iniciar, detener y reintentar siguen siendo exclusivos del Owner. El servidor rechaza los intentos de forzar una regeneración o cambiar modelo/configuración sin ese rol, también en fútbol. La cola respeta `Retry-After` antes de continuar cuando el servidor limita las solicitudes. Detenerla conserva el trabajo terminado.

## Comprobaciones realizadas

- `npm run test`: 176 pruebas aprobadas, incluidas restricciones de rol, combinación de selecciones de distintos deportes, multiplicación de cuotas sin redondeo y rechazo de ganadores inexistentes o encuentros vencidos.
- `npm run lint`: sin diagnósticos.
- `npm run build`: compilación correcta.
- 30 pruebas del navegador aprobadas sobre el paquete compilado: 10 en Chromium, 10 en WebKit con configuración móvil y 10 en Firefox. Incluyen agregación y eliminación del parlay, controles exclusivos del Owner, consultas automáticas como miembro en los cuatro deportes, procesamiento de 13 encuentros mientras la búsqueda muestra solo uno, conservación de los informes al recargar y espera tras un 429.
- 13 regresiones adicionales aprobadas en Chromium: mercados y hándicaps, fecha/hora y momios, navegación con teclado, redes sociales, Liga MX Femenil, consultas lentas y conservación/reanudación del avance de IA en fútbol. Total: **43 pruebas de navegador aprobadas**.

## Verificación con el proveedor real

`scripts/verify-member-automatic-ai.mjs` utiliza datos deportivos reales y una cuenta temporal local con almacenamiento aislado. No cambia cuentas, permisos ni configuración de producción. El archivo temporal y el servidor de prueba se eliminan al terminar. La evidencia sin credenciales está en `artifacts/member-automatic-ai-real-2026-10-06.json`.

Entre las 05:12 y 05:13 UTC se comprobaron cuatro respuestas nuevas de **deepseek-v4.1**, una por deporte, mediante solicitudes HTTP ordinarias de un miembro. Todas devolvieron HTTP 200, `aiAvailable: true`, `dataGrounded: true` y `analysisMode: fact-selection`. Los reintentos forzados y las sustituciones de modelo devolvieron 403. La segunda consulta ordinaria reutilizó cada informe, sin otra llamada al proveedor.

La IA prioriza hechos de los registros deportivos. Los porcentajes y momios teóricos proceden del modelo estadístico y no pueden ser reemplazados por cifras del modelo de lenguaje. La falta de datos sigue figurando como N/D. Estas pruebas comprueban ejecución real, coherencia y permisos; no establecen una tasa de acierto predictivo. El procesamiento del navegador requiere que la aplicación esté abierta con una sesión válida, y la actualidad de los datos depende de la publicación del proveedor deportivo.
