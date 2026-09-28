# Revisión del 28 de septiembre de 2026

## Resultado y alcance

Correcciones implementadas en el proyecto local. No desplegadas ni publicadas en Google Play. La web productiva sigue ejecutando su versión anterior.

No hay evidencia de una tasa real de aciertos del 90 %. Una probabilidad no puede superar el 100 %. Un modelo que asigna 90 % a un evento puede equivocarse; aumentar la cifra no mejora la predicción. Falta registrar pronósticos antes de cada encuentro y evaluarlos contra resultados posteriores, por mercado y temporada, con tamaño de muestra, Brier score, calibración y rentabilidad a cuotas realmente disponibles. No se reconstruyó un historial artificial de aciertos usando estadísticas posteriores al partido.

## Datos y cálculos

- Consulta real de ESPN: 32 encuentros en el feed; dos partidos revisados y 12 métricas de córners, tarjetas y faltas recalculadas sin discrepancias. Evidencia en `artifacts/live-data-audit.json`. Es una comparación contra el mismo proveedor, no una certificación independiente ni una revisión de todos los partidos.
- Eliminados valores ficticios de córners, tarjetas, faltas y muestras de cinco partidos que aparecían al faltar datos. Se presenta N/D.
- Los goles históricos no se reconstruyen desde medias proyectadas. Las medias Poisson no se presentan como xG observado.
- Un mercado 1X2 incompleto ya no convierte la única cuota disponible en 100 % de probabilidad. Los mercados completos se normalizan, las parejas complementan a 100 y se rechazan porcentajes inválidos.
- Se retiró la media fija de 2,70 goles como respaldo sin datos de goles; la estimación alternativa exige un mercado de goles completo o muestra suficiente.
- La IA ya no modifica selecciones, probabilidades ni cuotas numéricas. Su narrativa sigue siendo contenido generado, no información verificada automáticamente. Se invalidaron las cachés de análisis anteriores.
- Retiradas etiquetas «VERIFICADO 100 %». Diferenciadas cuotas publicadas y teóricas. Las estimaciones no equivalen a aciertos históricos; los cálculos actuales de partidos finalizados no son pronósticos archivados antes del inicio.

## Seguridad

Corregidos: clave Owner predeterminada, secreto de sesión conocido, excepción de seguridad en Vercel, recuperación de usuarios borrados desde cookies, aceptación de códigos eliminados, validación de sesión que ignoraba fallos de almacenamiento y creación de pruebas gratuitas cuando fallaba la persistencia.

Toda API en producción exige Owner y SESSION_SECRET independientes de al menos 32 caracteres y Redis HTTPS configurado. Si falla la lectura de revocaciones o usuarios, la autorización falla cerrada. Los endpoints Android requieren sesión Owner validada por el servidor y no permiten elegir rutas de archivo.

Los proveedores IA personalizados requieren dominio exacto autorizado en `AI_ALLOWED_HOSTS`; los proveedores predefinidos siguen habilitados. Solo añadir dominios de operadores de confianza, con DNS público y TLS válidos. Las redirecciones del cliente IA se rechazan. Esto reduce la superficie SSRF; no constituye una prueba de penetración de proveedores ni del alojamiento.

Se encontraron 129 códigos antiguos en `server/data/db.json`, archivo versionado no utilizado por el backend actual. Se vació su contenido sensible y caché obsoleta; se conservó una copia privada en `%LOCALAPPDATA%/Picks777/audit-backups/legacy-db-20260928.json`. El historial Git conserva versiones antiguas: revocar cualquier código reutilizado y revisar el acceso al repositorio. No se reescribió historia Git.

`npm audit`: cero vulnerabilidades conocidas en las dependencias revisadas. Búsqueda de valores secretos actuales del .env en archivos versionados: sin coincidencias. Esto no demuestra ausencia de secretos antiguos en todo el historial ni garantiza que el sistema sea imposible de atacar.

## Estado de la web publicada

Lectura sin modificaciones de `https://picks777.vercel.app`:

- `/api/health`: 200, `ready`, pero almacenamiento `serverless-memory`. Esa condición es insegura para persistencia de membresías y revocaciones; el diagnóstico corregido no la acepta como lista.
- `/api/admin/codes` y `/api/admin/mobile`: 401 sin sesión.
- `/.env` y `/server/data/db.json`: devolvieron la página HTML de la SPA, no los archivos solicitados.
- Digital Asset Links y manifiesto: públicos y presentes. Certificado del APK local coincide con el declarado.

Antes de desplegar: configurar Redis y secretos seguros en Vercel, planificar la conservación/migración de usuarios existentes y comprobar lectura/escritura persistente. Cambiar SESSION_SECRET invalida sesiones anteriores. En el .env local no se encontraron SESSION_SECRET ni variables Redis; no se inventaron credenciales ni se modificó la cuenta de alojamiento.

## Android

- TWA, HTTPS, API objetivo 36, sin puente JavaScript nativo; respaldo Android desactivado.
- APK firmado: `artifacts/android/picks777-preview.apk`, versión 1.0.5, compilación 4.
- AAB firmado: `artifacts/android/picks777-release.aab`. Compilación y lint vital de Android correctos.
- Firma APK comprobada con apksigner; huella coincide con Digital Asset Links. El verificador emite advertencias de metadatos META-INF para firma JAR v1; no son fallos de verificación. Conservar también las firmas modernas del APK.
- Nuevo panel Owner → Aplicación Android, descarga autenticada, versión, tamaño e integridad SHA-256. Muestra un estado explícito si el APK falta o está corrupto.
- `npm run android:preview` compila con la clave existente y prepara APK y manifiesto. `npm run android:bundle` genera AAB. Aumentar versionCode para cada futura actualización y conservar la firma.
- La app abre la web desplegada: los cambios web necesitan despliegue. La TWA obtiene la nueva web al recargar; cambios nativos requieren una nueva versión Android.
- Vercel incluye los dos archivos de prueba en la función. `.vercelignore` permite subirlos por CLI sin subir claves, datos privados ni SDK. El APK firmado de prueba se incluye en Git para los despliegues automáticos; las claves privadas siguen excluidas.

## Pruebas

- 108 pruebas Node correctas, incluida regresión de datos inventados, inyección numérica de IA, mercados incompletos, sesiones revocadas y permisos de descarga.
- 12 pruebas Playwright de interfaz móvil correctas (320 a 844 píxeles), más una nueva del panel Android a 360 píxeles. Autenticación y datos simulados exclusivamente en esas pruebas.
- Verificación adicional HTTP del APK real: descarga Owner, hash coincidente, denegación a anónimos y VIP.
- Build web, lint y prueba offline correctos. El service worker solo conserva la página pública offline.
- Captura del panel inspeccionada: `artifacts/mobile/admin-android-360.png`, con metadatos de prueba.
- ADB no encontró teléfonos conectados. No se verificó una instalación física ni Google real en el teléfono.

## Pendientes que impiden declarar lista la publicación

1. Redis, secretos y despliegue de web/backend corregidos.
2. Correo real obligatorio de contacto y política de privacidad completa. El responsable confirmó que es una persona independiente y que aún no dispone de soporte; no se inventó una empresa ni un correo.
3. Cuenta/ficha Play Console, países, declaración de datos, clasificación por edad y evaluación de elegibilidad por contenido relacionado con apuestas. La compilación no garantiza aprobación.
4. Certificado de Play App Signing en assetlinks, pista de pruebas, informe previo al lanzamiento y pruebas de instalación/login/borrado en dispositivo real. No se subió el AAB.

Referencias oficiales consultadas:

- https://developer.android.com/google/play/requirements/target-sdk
- https://support.google.com/googleplay/android-developer/answer/9859152
- https://support.google.com/googleplay/android-developer/answer/10144311
- https://support.google.com/googleplay/android-developer/answer/9877032

## Actualización de membresías y configuración

- Configuradas en Vercel Production la integración Upstash (KV_REST_API_URL/TOKEN), SESSION_SECRET y OWNER_GOOGLE_EMAIL por solicitud del propietario.
- Canje ligado a un usuario Google, exclusión de otras cuentas y vencimiento exacto desde el primer uso. Entrar de nuevo no renueva el código ni pide repetirlo.
- Owner se obtiene desde el correo Google verificado configurado; el código maestro deja de concederlo cuando ese correo está configurado.
- 111 pruebas Node y 14 Playwright correctas; build y lint correctos. Las pruebas de Google usan respuestas del proveedor simuladas.
- Los datos antiguos que existieran solo en memoria de Vercel no constituyen una base persistente exportable; no se ha confirmado una migración de membresías históricas.
