# Android 1.1.0 — entrega y publicación

Esta guía sustituye las instrucciones antiguas de TWA para la versión 1.1.0, compilación 6. Estado: candidato local; no constituye una aprobación de Google Play ni una certificación en teléfonos físicos.

## Qué aplicación se entrega

Android abre una Activity propia con Android System WebView. Al tocar el icono no lanza Chrome, Samsung Internet ni otro navegador. Es una aplicación Android híbrida: la ventana y navegación son Android, y el contenido React/API se obtiene por HTTPS del dominio picks777.vercel.app. No es una interfaz completamente escrita en controles nativos y necesita conexión para los datos.

Google se identifica en el navegador del sistema solo cuando el usuario pulsa el acceso. Google prohíbe introducir sus credenciales dentro de una WebView. Después de confirmar la cuenta se vuelve a la app. Un intercambio de cinco minutos, vinculado a un secreto aleatorio que permanece en la app, entrega la identidad una sola vez. Las cookies son propias de la app; los enlaces de regreso no llevan credenciales. La app no depende del SDK Google Play Services, pero sí de que Google sea accesible por red y de un navegador para la identificación. La eliminación de cuenta usa el mismo mecanismo de confirmación.

Los enlaces voluntarios a WhatsApp, Telegram y otras comunidades abren la aplicación correspondiente o el navegador. Eso no cambia el arranque: los partidos permanecen dentro de 777 Picks.

## Compatibilidad real

- Mínimo del APK: Android 7, API 24. Objetivo: Android 16, API 36.
- Interfaz: Android System WebView basado en Chromium 111 o posterior. La app avisa si el motor instalado es demasiado antiguo.
- Samsung y otros fabricantes con Android y ese componente: diseño compatible; la marca por sí sola no demuestra compatibilidad con todos sus modelos.
- Huawei con Android/EMUI o una versión compatible con APK: candidato compatible, sin SDK Google Play Services. El acceso Google debe probarse en ese teléfono/red. Un Huawei sin Play Store necesita distribución por APK o un proceso separado para AppGallery.
- HarmonyOS NEXT requiere una aplicación específica; este APK no certifica soporte de ese sistema.
- Android 6 o anterior no está soportado por esta entrega. iOS usa la instalación web existente, no el APK/AAB.
- Pantallas comprobadas por pruebas de interfaz: 320, 360, 390, 412, 600 y 844 píxeles, incluida orientación horizontal. Esto simula tamaños; no equivale a probar físicamente Samsung/Huawei.
- No hay teléfono conectado por ADB durante esta revisión. Faltan instalación real, retorno real de Google y prueba de eliminación real en un dispositivo de prueba.

## Archivos y uso

- `artifacts/android/picks777-preview.apk`: instalador directo firmado. Sirve para probar en tu Samsung; conserva la clave de subida usada anteriormente.
- `artifacts/android/picks777-release.aab`: archivo para subir a Play Console. No se instala abriéndolo desde el teléfono. Google genera los APK apropiados a partir del AAB.
- `artifacts/android/release.json`: versión, tamaño y SHA-256 del APK.
- `artifacts/android/SHA256.json`: integridad de los archivos de entrega.

Antes de distribuir el APK nuevo hay que desplegar también el frontend y el backend de esta versión. El APK consulta el dominio publicado: compilarlo no despliega `/mobile-auth` ni `/api/auth/mobile/*`. La versión productiva anterior no sabe completar el acceso nuevo.

## Compilar

```powershell
npm test
npm run lint
npm run build
npm run test:browser
npm run test:offline
npm run android:preview
npm run android:bundle
```

Prueba Android nativa: `android/gradlew.bat -p android testDebugUnitTest lintDebug --max-workers=2` con JAVA_HOME apuntando al JDK 17. El SDK local está en `.tools/android-sdk`. El script de compilación encuentra el JDK portátil y lee la clave existente desde `%LOCALAPPDATA%/Picks777/signing/`. No publicar claves ni contraseñas. Conservar copia cifrada de la clave para futuras actualizaciones.

## Proceso de Google Play

1. Crear o usar una cuenta de desarrollador **personal**. No necesitas inventar una empresa. Completar identidad y contactos exigidos por Google.
2. Crear la ficha 777 Picks con el paquete `app.picks777.mobile`; conservarlo para todas las actualizaciones. Añadir nombre, descripción fiel, icono, capturas reales, categoría y países deseados.
3. Completar privacidad, seguridad de datos, clasificación por edades, acceso para revisión y eliminación de cuenta. La URL de privacidad es `/privacidad.html`; borrado `/eliminar-cuenta`.
4. Activar Play App Signing. La clave de subida local firma el AAB; Google puede usar una clave distinta para las instalaciones. Su certificado SHA-256 se añade a `mobile.config.json` y se regenera/despliega `assetlinks.json` para enlaces verificados. La ventana interna ya no depende de esa verificación.
5. En Pruebas internas, crear una versión y subir **picks777-release.aab**. Resolver los avisos de Play, instalar desde el enlace de pruebas y revisar el informe previo al lanzamiento.
6. Cuando se aplique a una cuenta personal nueva: al menos **12 probadores inscritos de forma continua durante 14 días**, y solicitud de acceso a producción. La consola determina qué requisitos aplica a tu cuenta.
7. Elegir los países y enviar a revisión cuando los requisitos estén resueltos. La aprobación depende de Google.
8. Para actualizaciones: incrementar `versionCode`, conservar identidad/firma, recompilar y subir el AAB nuevo. Los cambios web se despliegan por separado.

## Impedimentos que no se pueden resolver inventando datos

- El propietario decidió mantener solo grupos como contacto. Se respetó dentro de la app y la privacidad enlaza esos canales. **Google Play exige un correo público de contacto en la ficha incluso para una cuenta personal**. Sin proporcionarlo no se puede completar la publicación.
- No hay prueba física Samsung/Huawei ni confirmación del flujo real de Google en la nueva WebView. Robolectric y Playwright no sustituyen esas pruebas.
- La política de conservación de logs y backups necesita ajustarse a la configuración real del alojamiento; no se inventó un plazo.
- Falta comprobar en Play Console identidad, países, acceso de revisores, certificado de firma, ficha y pruebas requeridas. No se ha subido el AAB.
- Los picks, cuotas, simulaciones y comunidades relacionadas con apuestas requieren revisar elegibilidad y destinos reales según las políticas de juegos con dinero real y publicidad. Si se venden accesos digitales, también aplica la política de pagos correspondiente: este proyecto no integra Play Billing. No se declara aprobación automática por elegir la categoría Deportes.

## Datos e IA

Los cálculos son estimaciones Poisson, no resultados garantizados ni un modelo de aciertos calibrado. Las probabilidades del modelo de respaldo se calculan ahora desde la misma distribución que los marcadores; las probabilidades de mercado quedan separadas. Una única cuota ganadora no autoriza completar el resto con valores inventados.

La IA selecciona hechos existentes del catálogo. Se descarta su texto libre y cualquier número o selección que intente inventar. El informe distingue IA disponible de un informe puramente estadístico. No hay historial prospectivo validado suficiente para publicar una tasa de aciertos real, Brier score o rentabilidad. Un análisis de un partido terminado no se contabiliza como pronóstico acertado previo.

La auditoría del 28-09-2026 revisó los 15 encuentros que devolvió el listado: 98 comparaciones, 86 con valores y 12 sin muestra suficiente, cero discrepancias. La fuente es ESPN; contrastar otra respuesta del mismo proveedor no es una verificación independiente. Las ligas sin encuentros en esa respuesta no se rellenan con partidos ficticios. El informe por partido está en `artifacts/live-data-audit.json`.

## Referencias oficiales revisadas

- [Contacto obligatorio en Google Play](https://support.google.com/googleplay/android-developer/answer/13634081?hl=en)
- [Cuentas personales](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en)
- [Pruebas personales de 12 usuarios y 14 días](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [API objetivo](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- [Apuestas y dinero real](https://support.google.com/googleplay/android-developer/answer/9877032/)
- [Política OAuth de Google](https://developers.google.com/identity/protocols/oauth2/policies)
- [Compatibilidad CSS](https://tailwindcss.com/docs/compatibility)
