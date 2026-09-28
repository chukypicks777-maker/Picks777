# Compatibilidad y coherencia de datos

La web ofrece instalación en `/instalar`, iconos PNG para Android y Apple, modo standalone y adaptación de 320 a 844 px, además de iPad a 768 px. iPhone/iPad se instalan desde Safari mediante Añadir a pantalla de inicio. No se ha creado ni publicado un binario iOS en App Store. El APK Android firmado sigue en 1.0.6, compilación 5; esta actualización modifica la web que abre.

La apertura de Google ya no espera una importación dinámica ni un cambio de persistencia dentro del toque del usuario. La identidad Firebase permanece en memoria y la autorización se mantiene en la cookie del servidor. Las pruebas de acceso simulan las respuestas Google; no sustituyen una prueba física de Safari instalado ni prueban todos los modelos/Android/iOS antiguos.

Validación: 113 pruebas Node; 45 pruebas de instalación, diseño y sesiones en Chromium, WebKit y Firefox; otras 3 verifican que una respuesta estadística no se anuncie como éxito de IA. Compilación, lint y funcionamiento offline comprobados. La pantalla offline no ofrece datos deportivos antiguos como actuales.

Datos: `artifacts/live-data-audit.json` registra 32 partidos con fuentes y fechas, controles de rango, suma 1X2, complementos, escalera de goles, BTTS y cuotas. En tres encuentros se recalcularon 18 métricas históricas sin discrepancias. Es un contraste con nuevas respuestas del mismo proveedor ESPN, no una validación independiente ni una medición de precisión predictiva.

Corregido: eliminación del anuncio fijo de 89 % sin evidencia, recuento separado de IA/cálculos/errores, invalidación de caché cuando cambian cuotas o probabilidades, y coherencia de la distribución de goles con probabilidades extremas. No se garantiza 90 % de aciertos ni ganancias.

Referencias: [instalación web en iPhone, Apple](https://support.apple.com/en-in/guide/iphone/iphea86e5236/ios), [acceso Google, Firebase](https://firebase.google.com/docs/auth/web/google-signin).
