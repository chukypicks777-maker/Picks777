# Entrega 777 Picks 1.1.3 — 29 de septiembre de 2026

La corrección y la preparación están en este proyecto local. Esta entrega no despliega la web ni publica en las tiendas. Android tiene APK y AAB firmados. iPhone tiene un proyecto Xcode preparado; no hay IPA firmado ni compilación verificada de iOS desde este equipo Windows.

## 1. Corrección de VIP

Abrir el panel conserva la cuenta y muestra «Activar membresía VIP» con el correo conectado. Cerrar, volver atrás o introducir un código inválido no ejecuta logout. El canje exitoso vuelve a comprobar la cookie y la membresía en el servidor antes de actualizar la cuenta. Un error de conexión/Redis al comprobar la sesión responde 503 y ofrece reintentar; ya no se interpreta como cierre de sesión. Los datos protegidos siguen necesitando autorización del servidor.

El problema exacto de la captura no se reprodujo con la versión actual en las pruebas iniciales. Se corrigieron fallos comprobables de manejo de interrupciones y se añadieron pruebas del flujo completo. No se afirma haber probado la cuenta personal del propietario.

## 2. El requisito comercial pendiente

El propietario confirmó que vende códigos por Telegram y otros grupos. Es contenido digital que se utiliza dentro de la app. Ser un proyecto personal no da una excepción automática a las reglas de las tiendas.

En el canal iPhone, el código oculta el canje y las comunidades comerciales y permite consultar el estado de la cuenta. Esto es una preparación de la interfaz, **no una certificación de cumplimiento**. No existe integración StoreKit ni Play Billing en este proyecto. No se debe enviar como aplicación comercial terminada mientras esto esté sin resolver.

Para una distribución general, la ruta a evaluar es ofrecer también VIP mediante las compras autorizadas de cada tienda, conservando el acceso de los clientes existentes cuando la política aplicable lo permita. Eso requiere implementar y probar compras, restauración, verificación en servidor, vencimientos, cancelaciones, reembolsos y notificaciones de la tienda; además de crear los productos y precios reales en sus consolas. No basta con crear un producto en App Store Connect: falta esa integración de código. Si se elige una excepción o un programa regional, hay que confirmar que se aplica a esta app y a sus países de distribución.

Apple restringe el desbloqueo por claves externas (3.1.1); el acceso a compras de otros canales en servicios multiplataforma tiene condiciones (3.1.3). Google exige su sistema de facturación en los casos indicados por su política de pagos. Los pronósticos, cuotas, combinadas y grupos de apuestas también necesitan evaluar elegibilidad según el contenido real y los destinos; elegir «Deportes» no resuelve esa evaluación.

Fuentes: [Apple, pagos y revisión](https://developer.apple.com/app-store/review/guidelines/#business), [Google, pagos](https://support.google.com/googleplay/android-developer/answer/9858738?hl=es), [Google, apuestas y dinero real](https://support.google.com/googleplay/android-developer/answer/9877032?hl=es).

## 3. Preparar iPhone en un Mac

1. Copiar y descomprimir `artifacts/ios/picks777-ios-source-1.1.3.zip` en un Mac con la versión vigente de Xcode. El ZIP contiene el proyecto iOS y estas instrucciones. No contiene claves privadas ni un IPA.
2. Abrir `ios/Picks777.xcodeproj`. Seleccionar el proyecto, target **Picks777**, **Signing & Capabilities** y tu **Team** de Apple Developer; mantener la firma automática. El identificador es `app.picks777.mobile`, versión `1.1.3`, build `9`. La clave de firma de Android no se utiliza para Apple.
3. Seleccionar un simulador de iPhone y pulsar Run. El mínimo configurado es iOS 17. Se ofrece navegación propia, calculadora de probabilidad implícita offline, cuenta, soporte y privacidad. El contenido deportivo y las membresías usan la web por HTTPS. Verificar las advertencias que muestre Xcode; no se ha compilado con el SDK de Apple en Windows.
4. Opcional: desde Terminal, entrar en la carpeta `ios` y ejecutar `bash prepare-mac.sh`. Valida los plist, compila para simulador sin firma y abre Xcode. No necesita CocoaPods ni XcodeGen. La primera ejecución de Xcode puede pedir instalar su SDK y aceptar su licencia.
5. Antes de probar los accesos, desplegar el frontend y backend 1.1.3 del repositorio al alojamiento existente. El wrapper consulta `https://picks777.vercel.app`; el ZIP iOS no despliega esos cambios. Mantener Redis y SESSION_SECRET de producción; no reemplazar sus secretos por los de las pruebas.

## 4. Activar acceso con Apple

El código incluye el botón Apple en iPhone, el intercambio temporal de identidad y `/api/auth/apple`. Firebase verifica la identidad del proyecto y el servidor rechaza perfiles o privilegios aportados por el cliente. La cuenta Owner sigue exigiendo Google. La eliminación de cuentas Apple confirma el mismo proveedor.

Falta la configuración externa y una prueba real:

1. En Apple Developer, registrar el App ID `app.picks777.mobile` bajo tu cuenta y habilitar **Sign in with Apple**.
2. Registrar un **Services ID** para el acceso web, asociado a ese App ID. Autorizar los dominios que solicita Apple para Firebase y registrar el Return URL `https://ia-luz.firebaseapp.com/__/auth/handler`, correspondiente al proyecto Firebase actualmente usado. Si se cambia el proyecto de Firebase, usar su URL real.
3. Crear la clave de Sign in with Apple y configurar en Firebase Authentication → Sign-in method → Apple el Services ID, Team ID, Key ID y clave privada. Guardar la clave privada solo en la consola/configuración segura; nunca en Git, la app o el ZIP.
4. Verificar los dominios autorizados de Firebase, incluido `picks777.vercel.app`. Probar Google y Apple desde el iPhone, regreso a la app, recarga y cierre completo/reapertura. También probar «Ocultar mi correo» y eliminación con una cuenta de prueba.
5. Un correo privado de Apple puede crear una cuenta distinta de la cuenta Google que tiene VIP. Para recuperar una membresía existente de Google, acceder con esa misma cuenta Google. No se debe prometer vinculación automática entre correos distintos.

Referencia: [Configurar Apple con Firebase](https://firebase.google.com/docs/auth/web/apple?hl=es). Revisar también [las reglas de acceso y funcionalidad de Apple, 4.8 y 4.2](https://developer.apple.com/app-store/review/guidelines/#design).

## 5. Subir a App Store Connect, cuando los pendientes estén resueltos

1. Tener Apple Developer activo y completar los acuerdos y verificaciones. Si habrá compras, completar también los datos bancarios/fiscales y configurar productos reales.
2. En App Store Connect, crear **777 Picks** para iOS y elegir el Bundle ID registrado. Usar los textos de `APP-STORE-FICHA.md` como borrador, revisándolos según el modelo comercial final.
3. En Xcode, seleccionar **Any iOS Device**, **Product → Archive**. En Organizer, elegir **Validate App** y después **Distribute App → App Store Connect → Upload**. Corregir cualquier error de firma, SDK, iconos o privacidad antes de subir. Nunca seleccionar el APK/AAB para iPhone.
4. Probar el build en **TestFlight** en un iPhone real: cuentas normales y VIP, Google y Apple, cancelación de acceso, regreso del navegador, cierre y reapertura, prueba vencida, errores de conexión y borrado. Las pruebas WebKit de Windows no sustituyen esto.
5. Completar capturas reales de iPhone, soporte, privacidad, App Privacy, cuestionario de edad, países, derechos del contenido y acceso de revisión estable con todas las funciones. La declaración de privacidad incluye cuenta, identificadores, foto de Google cuando existe y datos técnicos; no declarar «no recopilamos datos».
6. Asociar el build y los productos de compras si corresponde, completar las notas de revisión y enviar a revisión. Apple decide la aprobación; un contenedor web y una herramienta nativa no garantizan por sí solos aceptación bajo 4.2.

## 6. Android / Google Play

Archivo de subida: `artifacts/android/picks777-release.aab`, versión 1.1.3, código 9. Instalador para pruebas directas: `artifacts/android/picks777-preview.apk`. La clave existente se conserva; no se ha creado otra.

1. Completar Play Console e identidad y crear la app con `app.picks777.mobile`.
2. Resolver el modelo de pagos y la elegibilidad según las políticas anteriores; la versión Android actual mantiene el canje y comunidades de la web y **no incluye Play Billing**.
3. Completar ficha, privacidad, seguridad de datos, público/edad, países y acceso del revisor. Las URL son `/privacidad.html`, `/contacto` y `/eliminar-cuenta` en el dominio oficial.
4. Activar Play App Signing y subir el AAB a pruebas internas. Registrar el certificado final de Google en `mobile.config.json` si difiere del certificado de subida, regenerar `assetlinks.json` y desplegarlo.
5. Instalar desde el enlace de pruebas y comprobar el informe previo al lanzamiento y los flujos en un teléfono real. Si la cuenta está sujeta a pruebas personales previas a producción, cumplir los requisitos indicados por Play Console.
6. Resolver los avisos y enviar a revisión. La fuente de verdad sobre acceso a producción es tu consola.

## 7. Comprobaciones y límites

Evidencia actual en `artifacts/tests-store-2026-09-29.txt`, `lint-store-2026-09-29.txt`, `build-store-2026-09-29.txt`, `offline-store-2026-09-29.txt` y `browser-store-final-2026-09-29.txt`. La corrida anterior de navegador se hizo durante cambios de archivos y no se usa como validación final.

No se ha instalado esta versión en teléfonos físicos, configurado tu cuenta Apple, compilado un IPA, implementado cobros de tienda, desplegado esta corrección ni enviado builds a revisión. Estos pendientes son materiales; no se declara «cero errores» fuera de lo comprobado. El informe `VALIDACION-TIENDAS-2026-09-29.md` registra el resultado final disponible.
