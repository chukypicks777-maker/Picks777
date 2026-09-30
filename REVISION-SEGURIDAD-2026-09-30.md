# Revisión de seguridad y apartados deportivos — 30 de septiembre de 2026

## Fallos reproducidos y corregidos

1. **Reinicio de la prueba al borrar la cuenta.** Borrar el perfil y registrarse de nuevo con el mismo correo concedía otras 72 horas. Ahora una huella HMAC del correo e identidad conserva el vencimiento original y si se consumió VIP. La clave de estas huellas queda en Redis, independiente de la clave de sesión. El perfil eliminado no se restaura, sus cookies dejan de funcionar y no se restituyen códigos VIP. La política de privacidad explica este registro residual. Las cuentas existentes conservan sus fechas originales; no se inventó un historial de cuentas eliminadas antes de esta corrección.
2. **Partidos inventados en el análisis.** La ruta aceptaba `body.match` cuando el identificador no existía en el feed. Un usuario autenticado podía obtener un informe marcado como ESPN con nombres y estadísticas enviados desde el navegador. Ahora el partido debe existir en el feed consultado por el servidor; los datos del cuerpo no lo reemplazan. El cliente dejó de enviar el partido completo.
3. **Filtros inválidos ignorados.** Boost, goles y BTTS devolvían resultados generales cuando fallaba la zona horaria o el formato del filtro. Ahora devuelven HTTP 400.
4. **Pantalla activa después del vencimiento durante una caída.** El servidor rechazaba el acceso vencido, pero el navegador conservaba `valid: true` si la comprobación fallaba. La interfaz aplica el vencimiento confirmado, conserva la identidad para canjear VIP y elimina las vistas y selecciones protegidas. Una caída de conexión anterior al vencimiento sigue conservando la sesión.
5. **Marcador falso 0–0 en el ticker.** Los goles ausentes se convertían en cero. Ahora muestran N/D y conservan los ceros reales. Un feed vacío tampoco se anuncia como LIVE.

Las reproducciones anteriores a las correcciones quedan en `artifacts/security-review-reproductions.txt` y `artifacts/security-review-expiry-before.txt`. No fueron pruebas sobre cuentas reales de producción.

## Apartados solicitados

Se añadieron las pestañas ⚽ Fútbol, ⚾ Béisbol, 🎾 Tenis y 🏀 Básquetbol debajo de la navegación. `/beisbol`, `/tenis` y `/basquetbol` muestran únicamente el deporte y «Próximamente», sin partidos ni estadísticas de demostración. Permiten recargar, compartir la dirección y usar atrás/adelante. Los controles de estadísticas, parlay y sincronización quedan desactivados en esos apartados; el sondeo de fútbol se pausa. El apartado de fútbol conserva sus filtros y funcionalidades.

## Evidencia y límites

- Prueba de vencimiento: exactamente 72 horas; la cookie original recibe HTTP 403 en todas las rutas protegidas comprobadas. Reingresar no renueva la fecha. Borrar/recrear mantiene la fecha original, incluso con otro identificador Firebase, y no recupera VIP ni la prueba después de consumir VIP.
- 126 pruebas Node correctas. Incluyen autenticación, revocación, códigos vinculados, caídas de almacenamiento y las nuevas regresiones. Los proveedores de identidad y las caídas se simulan exclusivamente en pruebas aisladas; no se modificaron usuarios de producción.
- Navegadores: 102 casos correctos en la pasada completa. El caso antiguo que permitía cerrar el acceso después de vencer se ajustó a la regla solicitada de 72 horas y a un reloj controlado. La comprobación final repitió ese caso, vencimiento sin conexión, deportes y recarga en Chromium, WebKit y Firefox: 12 casos correctos. Evidencia en `artifacts/security-review-browser-all.txt` y `artifacts/security-review-browser-final.txt`.
- Auditoría de datos reales: 26 partidos y 162 comprobaciones de marcadores y promedios sin discrepancias, consultando respuestas nuevas de ESPN. Resultado en `artifacts/security-review-live-data.json`. Es un contraste contra el mismo proveedor, no una validación independiente ni de precisión de pronósticos.
- `npm audit`: cero vulnerabilidades conocidas en dependencias de producción y desarrollo en esta revisión. Esto no prueba ausencia de vulnerabilidades desconocidas.
- Build, lint, comportamiento offline y pruebas de navegador registrados en `artifacts/security-review-*`. Capturas del selector y el apartado vacío inspeccionadas a 320 píxeles.
- Comprobación inicial de producción: HTTPS, Redis disponible, API privada sin caché compartida, rutas de administración y partidos denegadas sin sesión. Las solicitudes a `.env` y al archivo de cuentas devuelven el HTML público de la aplicación y no esos archivos.

La validación no fue una prueba de penetración exhaustiva ni garantiza la exactitud del proveedor deportivo. No se cargaron fixtures de pruebas ni datos predefinidos en la web publicada.
