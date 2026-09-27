# Validación de la entrega Android — 25 de septiembre de 2026

## Resultado

Se conserva la aplicación web React/Express y se añade un proyecto Android TWA. Se generaron un APK instalable firmado y un AAB firmado, con paquete `app.picks777.mobile`, versión `1.0.0` / código `1`, objetivo API 36. Son archivos de entrega técnica; **no equivalen a una aplicación publicada o aprobada por Google Play**.

Archivos finales: `artifacts/android/777-picks-1.0.0.apk`, `artifacts/android/777-picks-1.0.0.aab`. Sus hashes están en `artifacts/android/SHA256.json`.

## Comprobaciones realizadas

| Comprobación | Resultado |
| --- | --- |
| `npm run lint` | Sin errores ni advertencias de Oxlint |
| `npm test` | 76 pruebas aprobadas |
| `npm run test:browser` | 12 pruebas aprobadas con emulación táctil Chromium |
| `npm run build` | Compilación web correcta |
| `npm audit --omit=dev` | 0 vulnerabilidades conocidas detectadas |
| Android `assembleRelease`, `bundleRelease` | Compilación y firma correctas |
| Android `lintDebug`, `lintRelease` | 0 errores; 2 advertencias: versión más nueva de Gradle y compatibilidad de reglas de backup |
| `apksigner verify` | APK firmado válido (v1 y v2) |
| `bundletool validate` | AAB final válido |
| Distribución Gradle | SHA-256 comprobado contra el publicado por Gradle; checksum fijado en el wrapper |
| `node scripts/test-offline.mjs` | Navegación offline y Digital Asset Links local correctos; caché solo con `/offline.html` |
| `git diff --check` | Sin errores de espacios |
| `adb devices` | Sin teléfono o emulador conectado; ejecución nativa pendiente |

Los avisos de certificados autofirmados de JAR son esperables para una clave Android propia; no se usó un certificado TLS para firmar la aplicación. `apksigner` informa también sobre metadatos `META-INF` no cubiertos por la firma JAR v1; la verificación v2 del APK fue satisfactoria. No se ocultaron fallos de compilación mediante un baseline de lint.

## Acceso y sesiones

- La aplicación espera la comprobación inicial antes de presentar el acceso. Ya no trata los permisos de `localStorage` como sesión válida.
- Las respuestas antiguas no sobrescriben una sesión nueva. Las consultas de partidos canceladas no pueden cerrar una sesión posterior.
- «Continuar con mi Prueba Gratuita» confirma la cookie en el servidor antes de cerrar el formulario. Si no se conserva, muestra un error explícito en el mismo paso.
- Se probaron: Google simulado → prueba → recarga, cookie perdida, cambio de cuenta y prueba vencida. Los servicios reales de Google/Firebase no se alteraron en estas pruebas.
- Cerrar sesión revoca el identificador en almacenamiento; se comprobó que reutilizar la cookie original deja de funcionar.
- La eliminación exige verificar la misma identidad. Se comprobó rechazo de otra cuenta, fallo del proveedor sin falso éxito, eliminación y bloqueo de la sesión antigua.

## Adaptación móvil

Probado a 320×568, 360×640, 390×844, 412×915, 600×960 y 844×390, con identidad y partidos de prueba. Capturas en `artifacts/mobile/`. Comprobación adicional de abrir/cerrar detalle y parlay en 320×568 y 844×390. Se revisaron visualmente capturas verticales y horizontales.

Se permite ampliar texto/zoom; hay alturas dinámicas, márgenes para recortes de pantalla, controles táctiles, foco visible y reducción de movimiento. Los paneles internos tienen altura máxima y desplazamiento para mantener accesibles sus controles. El estado «Copiado» solo se muestra cuando el portapapeles confirma la escritura.

Las pruebas bloquean recursos externos para ser repetibles; algunos escudos aparecen sin cargar en las capturas. No son imágenes definitivas para la tienda. Las resoluciones probadas no representan todos los dispositivos ni sustituyen las pruebas físicas de teclado, Android, accesibilidad y navegador.

## Seguridad aplicada

- Se elimina la contraseña Owner predeterminada, los accesos rápidos que la mostraban y la carga de usuarios/códigos preactivados al crear una base vacía. Los datos locales existentes no se borraron.
- La validación de configuración segura se aplica a toda la API productiva; antes existía como función pero no protegía las rutas.
- El secreto de desarrollo sin configuración es aleatorio; producción necesita uno explícito y suficiente.
- Se eliminan permisos Owner/VIP derivados de marcas del navegador y se dejan de almacenar claves de IA en `localStorage`. Las instalaciones anteriores limpian ese campo al abrir la aplicación.
- Cookies HttpOnly, comprobación de identidad, controles de origen/JSON, permisos de servidor y límites de peticiones; las pruebas existentes de CSRF, cookies manipuladas y acceso administrativo siguen pasando.
- Cabeceras contra inclusión en marcos, objetos y cambio de URL base, MIME incorrecto, permisos innecesarios y conexiones HTTP productivas. La CSP es parcial: no sustituye controles de XSS ni constituye una auditoría de penetración.
- Android utiliza HTTPS, sin permisos de cámara, micrófono, contactos o ubicación, ni puente JavaScript nativo. Las reglas de backup del contenedor no controlan el almacenamiento propio del navegador.
- Clave privada de subida fuera del repositorio/OneDrive, acceso de Windows restringido. No se publicaron contraseñas.

## Límites y pendientes

No hubo despliegue en Vercel, cambios de Firebase/Play Console, envío a revisión, prueba con cuenta Google real ni ejecución en teléfono. La TWA abre el sitio desplegado; por eso las correcciones deben desplegarse antes de comprobarlas en el APK. Su validación de pantalla completa exige Digital Asset Links público y, en Play, la huella del certificado de firma de Google.

La política de privacidad sigue como borrador con contacto y conservación de logs/backups pendientes. La revisión de elegibilidad de pronósticos/apuestas, pagos, países, edad, ficha, pruebas cerradas y Seguridad de los datos corresponde a la versión y cuenta reales. Véase `ANDROID-RELEASE.md`.

No se promete ausencia total de errores o ataques. La auditoría de dependencias es una consulta de vulnerabilidades conocidas y las pruebas automatizadas cubren los casos descritos, no una certificación de seguridad de toda la infraestructura.
