# Picks777

Aplicación web de información deportiva con cliente React/Vite, API Express y aplicación Android híbrida con ventana propia (WebView). Revisión actual: [AUDITORIA-2026-09-28.md](AUDITORIA-2026-09-28.md).

Preparación 1.1.3 y corrección del panel VIP: [PUBLICAR-TIENDAS.md](PUBLICAR-TIENDAS.md). Incluye proyecto Xcode en `ios/Picks777.xcodeproj` y guía de Apple/Firebase. La publicación comercial tiene pendientes de pagos de tienda, configuración externa y pruebas en Mac/dispositivos; no hay IPA firmado. `npm run ios:prepare` regenera el proyecto desde `mobile.config.json` sin claves privadas.

## Datos y probabilidades

El backend consulta ESPN y conserva fuente y fecha de consulta. Las métricas ausentes se muestran como N/D. El modelo usa Poisson independiente sobre goles observados; como alternativa usa cuotas de mercados completos para aproximar una distribución. No implementa xG observado, Dixon-Coles ni una calibración histórica validada. La IA prioriza hechos del catálogo; su texto libre se descarta y no puede reemplazar números, cuotas ni selecciones calculadas.

No se garantiza una tasa de aciertos del 90 % ni ganancias. Las cuotas teóricas derivadas del modelo se distinguen de las publicadas. Las combinadas son simulaciones bajo independencia, no apuestas colocadas. Deben confirmarse las cuotas y condiciones con el proveedor correspondiente.

## Desarrollo y comprobaciones

Además del fútbol masculino, `/femenil` consulta exclusivamente Liga MX Femenil. Los informes de fútbol incluyen córners totales 5.5, 6.5, 7.5, 8.5 y 9.5 y tarjetas amarillas totales 2.5, 3.5 y 4.5, con ambos lados de cada línea.

`/beisbol`, `/tenis` y `/basquetbol` consultan `/api/sports/:sport` bajo la misma sesión autenticada. Béisbol utiliza MLB Stats API para MLB y LMB (liga 125), y los calendarios oficiales de NPB y KBO. Calcula ganador, carreras por equipo 1.5–5.5, primer inning 1X2 y total combinado de innings 1 a 5, 1.5–5.5. Poisson usa hasta 20 resultados terminados anteriores al encuentro, con al menos 5 por equipo; ajusta el reparto de carreras a la fuerza relativa Elo cuando existe muestra suficiente. Primer inning y F5 requieren registros reales de esos periodos, con al menos 5 por equipo: nunca se inventan dividiendo las carreras por nueve. Los totales completos incluyen entradas extra presentes en los resultados de origen. NPB/KBO permiten empate; su frecuencia se estima por separado y se declara el suavizado. MLB/LMB condicionan el ganador al resultado decisivo.

Tenis muestra individuales ATP/WTA y los cuatro Grand Slams. Ganador, primer/segundo set y gana al menos un set (sí/no) provienen de un modelo de sets independientes, con la misma probabilidad por set. Usa cuotas completas sin margen o fuerza relativa Elo de resultados anteriores; exige 5 partidos y 5 sets por jugador para el historial. El formato distingue circuito, torneo y ronda, incluida la última ronda masculina de clasificación de Wimbledon. No incorpora superficie, lesiones ni evolución en vivo; excluye retiros del historial. Básquetbol ofrece únicamente NBA, pretemporada NBA, NCAA femenina y WNBA: ganador y hándicaps +1.5 a +7.5 y −1.5 a −6.5 por equipo. Los hándicaps usan una distribución normal del margen observado y requieren 5 partidos por equipo de la misma competición; pretemporada puede incluir las dos temporadas anteriores.

Todos estos modelos son estimaciones previas al partido, sin precisión prospectiva validada. Los informes muestran muestra, fuente, consulta y método; N/D conserva la falta de datos. Una liga sin encuentros dentro del calendario consultado muestra un estado vacío. La página indica fallos de cobertura y permite reintentar; no sustituye caídas con partidos de demostración. NPB/KBO muestran calendario y resultados disponibles sin prometer marcador en vivo. Los feeds de nuevos deportes se actualizan cada minuto mientras la página está visible; la hora de consulta no acredita el instante de actualización del proveedor. Auditoría de fuentes, coherencia y límites predictivos: [VALIDACION-MERCADOS-2026-10-05.md](VALIDACION-MERCADOS-2026-10-05.md).

Actualización de béisbol: las tablas usan Over/Under; “Totales extra innings” muestra el total combinado del partido completo, incluidas entradas extra, de 1.5 a 9.5. Los bloques de anota al menos una carrera se retiraron de la interfaz. “¿Habrá extra innings?” abre las probabilidades sí/no a partir de una frecuencia histórica suavizada de innings comprobables y duración reglamentaria publicada, mínimo 5 partidos por equipo, sin duplicar un mismo encuentro. NPB/KBO mantienen N/D para esa opción mientras falte dicha metadata. Béisbol, tenis y básquetbol incorporan enlaces de comunidades configurables y tarjetas que abren el informe desde cualquier punto y con teclado. Pruebas y evidencia: [VALIDACION-AJUSTES-BEISBOL-2026-10-05.md](VALIDACION-AJUSTES-BEISBOL-2026-10-05.md).

Node 22. Instalar con npm ci. Ejecutar npm run dev para frontend y backend; npm run build y npm start para servir la compilación. Comprobaciones: npm test, npm run lint, npm run test:browser y npm run test:offline.

## Producción

Configurar exclusivamente en servidor OWNER_GOOGLE_EMAIL con la cuenta Google verificada del propietario, SESSION_SECRET aleatorio de 32 caracteres o más, UPSTASH_REDIS_REST_URL HTTPS y UPSTASH_REDIS_REST_TOKEN. Redis es obligatorio en producción. La API rechaza acceso si falta configuración segura o no puede verificar la sesión. No usar secretos VITE_* ni subir .env, claves Android o bases de usuarios.

La integración Upstash de Vercel con prefijo KV también está soportada mediante KV_REST_API_URL y KV_REST_API_TOKEN. No se usa el token de solo lectura; usuarios y revocaciones necesitan escritura. Si se especifica cualquier variable UPSTASH_REDIS_REST_*, completar ambas: no se mezclan credenciales entre bases. Mantener bases separadas para producción y previews.

IA opcional: CUSTOM_AI_API_KEY, CUSTOM_AI_BASE_URL y DEFAULT_AI_MODEL. Para un dominio distinto a los predefinidos, autorizar su hostname exacto con AI_ALLOWED_HOSTS tras verificar al proveedor. Las claves no se exponen en el frontend.

## Android

Para iPhone, iPad y navegadores Android: abrir `/instalar`. La app web se instala desde Safari/Chrome y recibe las actualizaciones web. El APK no sirve para iOS. Resultados y límites de las pruebas: [COMPATIBILIDAD-Y-DATOS-2026-09-28.md](COMPATIBILIDAD-Y-DATOS-2026-09-28.md).

El owner dispone del apartado Aplicación Android dentro del panel administrativo. npm run android:preview prepara un APK firmado y su manifiesto para descarga autenticada. npm run android:bundle genera el AAB. Incrementar versionCode en mobile.config.json al actualizar Android; conservar la clave de firma. Las actualizaciones web requieren desplegar la web, y se reciben al recargar.

El APK 1.1.0 muestra https://picks777.vercel.app dentro de su propia ventana. Requiere Android 7+ y WebView 111+. Solo Google y enlaces externos solicitados por el usuario abren otro programa. Hay que desplegar frontend y backend antes de distribuir este APK, porque incluye un flujo de acceso nuevo. La publicación en Play Store tiene pendientes de contacto, privacidad y pruebas físicas; véanse [ANDROID-RELEASE.md](ANDROID-RELEASE.md) y el informe de auditoría.

## Membresías vinculadas a cuentas

El primer canje exige una sesión Google verificada y vincula el código a un único ID de usuario mediante una transacción atómica. El vencimiento es primer canje + duración × 24 horas, sin renovarse al volver a entrar. Otra cuenta no puede usarlo; eliminarlo conserva una marca para impedir recrear el mismo código. Después de vencer no se recupera la prueba gratuita. Google restaura automáticamente el VIP mientras siga vigente. OWNER_GOOGLE_EMAIL desactiva el acceso Owner mediante código maestro.
