# Validación de 777 Picks 1.1.3, build 9

Resultados de esta entrega local, 29 de septiembre de 2026. No es una aprobación de las tiendas ni una prueba en teléfonos físicos.

| Comprobación | Resultado |
| --- | --- |
| Servidor, seguridad y cálculos | 121/121 aprobadas |
| Acceso Apple y borrado con identidad incorrecta/correcta | Prueba específica aprobada; proveedor real pendiente de configurar/verificar |
| Lint JavaScript | Sin errores |
| Compilación web | Correcta; aviso de tamaño del bundle superior a 500 kB |
| Navegación offline y Digital Asset Links | Aprobada; se almacena únicamente la pantalla pública offline |
| Interfaz Chromium, WebKit y Firefox | 98/99 en la corrida final; el escenario Owner de WebKit agotó 60 segundos y aprobó por separado sin cambios de código, 1/1 |
| Nuevos escenarios VIP e iPhone | Aprobados en los tres motores: código inválido, canje confirmado, fallo al refrescar sesión, ausencia de canje/comunidades en iPhone y acceso Apple |
| Android Robolectric | 12/12 aprobadas |
| Android lint | 0 errores, 3 advertencias: versión de Gradle, JavaScript requerido por WebView y texto nativo sin recurso de traducción |
| APK | Firma v2 válida; certificado coincide con la huella configurada |
| AAB | Validación bundletool correcta; versión 1.1.3, código 9, paquete app.picks777.mobile, objetivo API 36 |
| Firma AAB | jarsigner confirmó la firma; conserva avisos de certificado autofirmado, ausencia de timestamp y diferencias de lectura de metadatos como JAR. No se afirma una verificación sin advertencias |
| iOS | Fuentes, proyecto con 24 objetos/referencias, icono opaco de 1024 px y XML de plist/manifiesto comprobados. No compilado ni firmado con Xcode |

Las pruebas de interfaz usan cuentas y respuestas controladas. No demuestran acceso real con Google/Apple, compras reales ni funcionamiento en un iPhone físico. El escenario Owner que se repitió tuvo un timeout al buscar la pestaña Android; la repetición por separado pasó. No se oculta el fallo de la primera corrida.

El botón VIP de la versión inicial actual no reprodujo un logout. La corrección trata interrupciones comprobables: una respuesta 503 de almacenamiento/conexión ya no borra la identidad confirmada, el servidor no confunde esa interrupción con una sesión inexistente y el panel identifica la cuenta conectada. Las operaciones protegidas siguen autorizándose en el servidor. Un código inválido conserva acceso; el canje exitoso confirma la membresía almacenada antes de cerrar el panel.

## Evidencia

- `artifacts/tests-store-2026-09-29.txt`
- `artifacts/apple-auth-store-2026-09-29.txt`
- `artifacts/lint-store-2026-09-29.txt`
- `artifacts/build-store-2026-09-29.txt`
- `artifacts/offline-store-2026-09-29.txt`
- `artifacts/browser-store-final-2026-09-29.txt`
- `artifacts/browser-owner-recheck-2026-09-29.txt`
- `artifacts/android/tests-store-2026-09-29.txt`
- `artifacts/android/validation-store-2026-09-29.txt`
- `artifacts/android/manifest-store-2026-09-29.xml`
- `artifacts/android/apk-signature-store-2026-09-29.txt`
- `artifacts/android/signature-store-2026-09-29.txt`
- `artifacts/android/SHA256.json`

## Pendientes materiales

No se desplegaron los cambios a producción. El contenedor móvil necesita ese despliegue para recibir la corrección y el canal iOS.

Faltan Mac/Xcode y Apple Developer para compilar, firmar y probar el iPhone. El acceso Apple requiere activar/configurar el proveedor en Apple/Firebase y una prueba real, incluido correo privado y borrado. Falta decidir una modalidad de VIP admitida por las tiendas: no se implementaron StoreKit ni Play Billing y se confirmó venta externa de códigos. También faltan pruebas físicas, fichas, capturas reales, privacidad en las consolas, acceso de revisores y evaluación de elegibilidad del contenido deportivo relacionado con apuestas.

La guía operativa y los pasos están en `PUBLICAR-TIENDAS.md`. No se declara una entrega lista para aprobación comercial mientras estos puntos estén pendientes.
