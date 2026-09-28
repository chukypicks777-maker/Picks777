# Picks777 — Android y publicación

La web se conserva. Android es una **Trusted Web Activity (TWA)** que presenta el sitio HTTPS con el motor del navegador compatible del teléfono. Comparte la autenticación y las cookies de ese navegador. Requiere conexión para datos y acceso; incluye una pantalla pública sin conexión. No es una aplicación con los datos deportivos incorporados ni un WebView con puente JavaScript.

## Proyecto y configuración

- `android/`: proyecto Android Studio, Gradle Wrapper, Android Browser Helper 2.7.3.
- `mobile.config.json`: nombre, dominio, identificador, versión y certificados autorizados. Dominio inicial confirmado: `https://picks777.vercel.app`.
- Paquete inicial: `app.picks777.mobile`. Confirma que deseas conservarlo antes del primer envío: el identificador no se puede cambiar para actualizar la misma ficha.
- Android mínimo 6 (API 23), objetivo y compilación API 36. Navegador compatible actualizado requerido; sin verificación del dominio se muestra la barra del navegador.
- `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`: instalación web y pantalla sin conexión. El service worker no almacena respuestas de la API ni sesiones.
- `src/auth/`: contrato de proveedores, cliente de sesión y estado React. `server/auth/googleVerifier.js`: verificación independiente del proveedor en el servidor.

## Compilar en este equipo

Se prepararon JDK 17, Gradle 8.13 y SDK Android en `.tools/`, ignorado por Git. `android/local.properties` apunta al SDK local; tampoco se versiona.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Variant Debug
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Variant Release
```

En otro equipo instala JDK 17, SDK 36 y Build Tools 35.0.0; configura `JAVA_HOME` y `android/local.properties` o `ANDROID_HOME`. Abre `android/` en Android Studio. El wrapper descarga la versión fijada de Gradle. Para firmar también puedes proporcionar directamente `PICKS_KEYSTORE`, `PICKS_STORE_PASSWORD`, `PICKS_KEY_ALIAS` y `PICKS_KEY_PASSWORD`, y ejecutar `android/gradlew.bat -p android bundleRelease`. La tarea release falla si faltan credenciales de firma.

Salidas estándar:

- APK de pruebas: `android/app/build/outputs/apk/debug/app-debug.apk`.
- Bundle firmado de subida: `android/app/build/outputs/bundle/release/app-release.aab`.

El APK abre el **sitio actualmente desplegado**. Los cambios de esta entrega no aparecerán en el teléfono hasta desplegar la web y el backend. Un AAB no se instala directamente: se distribuye mediante Play Console o bundletool.

## Clave de subida

Se creó una clave de subida propia de este nuevo proyecto, fuera de OneDrive y del repositorio:

`C:\Users\rober\AppData\Local\Picks777\signing\`

Contiene `picks777-upload.jks` y `upload-credentials.json`. El acceso al directorio se restringió al usuario de Windows. Guarda una copia cifrada de ambos archivos fuera del equipo. No los publiques, no los adjuntes al repositorio y no compartas el JSON de credenciales. Las contraseñas no se imprimieron en la conversación. Si ya existía una ficha Android con otra clave, **no uses esta clave para actualizarla** sin el proceso de restablecimiento correspondiente.

La huella pública de esta clave está en `mobile.config.json`; no es un secreto. Con Play App Signing, Google firma las instalaciones con **otro certificado**. Añade la huella SHA-256 del **certificado de firma de la aplicación** de Play Console, conservando la de subida si necesitas instalaciones firmadas localmente:

```powershell
npm run mobile:configure
npm run build
```

Despliega los cambios y confirma que `https://picks777.vercel.app/.well-known/assetlinks.json` devuelve JSON público, sin redirección ni autenticación, con el paquete y la huella correctos. No agregues certificados debug al dominio público.

## Pendientes antes de publicar

1. Desplegar y verificar esta versión de la web y la API. No se ha desplegado automáticamente.
2. Configurar producción: `MASTER_ADMIN_CODE` aleatorio (recomendado 32–128 caracteres), `SESSION_SECRET` distinto (mínimo 32), Redis de producción en Vercel (`UPSTASH_REDIS_REST_URL` HTTPS y `UPSTASH_REDIS_REST_TOKEN`). Ya no hay contraseña Owner predeterminada ni usuarios preactivados al iniciar una base vacía. La API falla cerrada si la configuración productiva es insegura.
3. Comprobar Firebase: Google habilitado; dominio autorizado; API key restringida para las APIs y dominios necesarios. Probar una cuenta de pruebas real: acceso → continuar prueba → recarga → cerrar sesión → cambio de cuenta → eliminación. Las pruebas automatizadas simulan al proveedor y no certifican la configuración de tu consola.
4. Completar el **correo real de soporte/privacidad**, responsable aplicable y conservación de logs/backups en `public/privacidad.html`. Se usó Picks777 como marca independiente; no se inventó una empresa, identidad jurídica ni correo. El texto actual declara estos pendientes y no debe enviarse así a revisión.
5. Crear/configurar ficha en Play Console y Play App Signing. Agregar su certificado a Digital Asset Links. Probar el bundle en una pista interna, informe previo al lanzamiento, botones Atrás, Google, retorno desde enlaces, sin conexión, texto ampliado, Android 6/actual y teléfono físico.
6. Completar Seguridad de los datos con el comportamiento real de Firebase, Vercel, Upstash y demás proveedores. URLs propuestas: `/privacidad.html` y `/eliminar-cuenta`. La eliminación requiere confirmar la misma cuenta y permite cuentas con prueba vencida. Verificar también el comportamiento si un proveedor falla durante la eliminación: no se declara éxito hasta completar ambos borrados; si Firebase se eliminó y el almacenamiento falla, reautenticar y reintentar o resolver el registro pendiente desde soporte.
7. Revisar clasificación por edad, países de distribución y política de apuestas. La app ofrece picks, cuotas, simulaciones y enlaces a comunidades: su elegibilidad depende de funciones, promoción y destinos reales. No basta elegir la categoría «Deportes». No se garantiza aprobación. Si se venden accesos digitales, revisar la política de pagos antes de habilitar ventas externas; no hay integración de Play Billing en esta entrega.
8. Preparar ficha y capturas finales del teléfono con datos autorizados. Las imágenes en `artifacts/mobile/` son evidencias técnicas con identidad simulada; no son material definitivo de marketing. Cumplir las pruebas cerradas que Play Console exija para tu cuenta personal.

## Cambio futuro de dominio o Firebase

Antes de dejar de operar el dominio anterior, establece el nuevo HTTPS, configura hosting/API, autorízalo en Firebase y conserva la continuidad del almacenamiento. Cambia `origin` en `mobile.config.json`, regenera assetlinks, despliega en el nuevo dominio y publica una actualización Android. Mantén el dominio viejo disponible durante la migración para versiones instaladas. La sesión es propia de cada dominio: el usuario deberá autenticarse de nuevo.

Firebase web admite `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` y `VITE_FIREBASE_APP_ID`. El servidor usa `FIREBASE_WEB_API_KEY` y, para tokens Google directos, `GOOGLE_CLIENT_ID`. Cámbialos de forma coordinada, recompila la web y revisa la migración de usuarios. Los valores web Firebase identifican el proyecto; **nunca** pongas secretos de sesión, Owner, Redis o IA en variables `VITE_*`.

Para otro proveedor, añade un adaptador en `src/auth/providers.js` y su verificación criptográfica/servidor en `server/auth/`. Cambiar solo el texto o el botón no implementa un proveedor nuevo.

## Referencias oficiales revisadas

- [Trusted Web Activities](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- [API objetivo de Google Play](https://developer.android.com/google/play/requirements/target-sdk)
- [Política de apuestas y juegos con dinero real](https://support.google.com/googleplay/android-developer/answer/9877032)
- [Eliminación de cuentas](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Pruebas para nuevas cuentas personales](https://support.google.com/googleplay/android-developer/answer/14151465)

## Actualización de auditoría 28-09-2026

Compilación Android 4, versión 1.0.5. El comando npm run android:preview genera un APK release firmado instalable y prepara artifacts/android/picks777-preview.apk junto a release.json para Owner → Aplicación Android. La descarga requiere sesión owner y no se publica en public/. Compilar antes de desplegar; un despliegue desde Git debe incorporar el APK desde su proceso de entrega, ya que se ignora en Git. npm run android:bundle produce el AAB; copia de entrega en artifacts/android/picks777-release.aab.

Redis y secretos seguros ahora son obligatorios en toda producción. La web publicada sigue pendiente de esta configuración y del despliegue corregido. No subir a Google Play antes de resolver los puntos del informe AUDITORIA-2026-09-28.md. El responsable es una persona independiente y todavía no ha proporcionado un correo de contacto.

## Corrección 1.0.6 (compilación 5)

Se declara ManageDataLauncherActivity y su URL HTTPS. Android Browser Helper 2.7.3 intenta habilitar o deshabilitar este componente al arrancar; la versión anterior no lo declaraba. La prueba nativa detectó NameNotFoundException antes del cambio y dos pruebas Robolectric/API 28 pasan después (componente y ciclo de arranque sin navegador instalado). Se mantiene la misma firma para actualizar encima de 1.0.5. No hay dispositivo físico conectado para confirmar el cierre reportado con su logcat.
