# Picks777

Aplicación web de información deportiva con cliente React/Vite, API Express y aplicación Android TWA. Revisión actual: [AUDITORIA-2026-09-28.md](AUDITORIA-2026-09-28.md).

## Datos y probabilidades

El backend consulta ESPN y conserva fuente y fecha de consulta. Las métricas ausentes se muestran como N/D. El modelo usa Poisson independiente sobre goles observados; como alternativa usa cuotas de mercados completos para aproximar una distribución. No implementa xG observado, Dixon-Coles ni una calibración histórica validada. La IA redacta comentarios; no puede reemplazar los números ni las cuotas calculadas.

No se garantiza una tasa de aciertos del 90 % ni ganancias. Las cuotas teóricas derivadas del modelo se distinguen de las publicadas. Las combinadas son simulaciones bajo independencia, no apuestas colocadas. Deben confirmarse las cuotas y condiciones con el proveedor correspondiente.

## Desarrollo y comprobaciones

Node 22. Instalar con npm ci. Ejecutar npm run dev para frontend y backend; npm run build y npm start para servir la compilación. Comprobaciones: npm test, npm run lint, npm run test:browser y npm run test:offline.

## Producción

Configurar exclusivamente en servidor OWNER_GOOGLE_EMAIL con la cuenta Google verificada del propietario, SESSION_SECRET aleatorio de 32 caracteres o más, UPSTASH_REDIS_REST_URL HTTPS y UPSTASH_REDIS_REST_TOKEN. Redis es obligatorio en producción. La API rechaza acceso si falta configuración segura o no puede verificar la sesión. No usar secretos VITE_* ni subir .env, claves Android o bases de usuarios.

La integración Upstash de Vercel con prefijo KV también está soportada mediante KV_REST_API_URL y KV_REST_API_TOKEN. No se usa el token de solo lectura; usuarios y revocaciones necesitan escritura. Si se especifica cualquier variable UPSTASH_REDIS_REST_*, completar ambas: no se mezclan credenciales entre bases. Mantener bases separadas para producción y previews.

IA opcional: CUSTOM_AI_API_KEY, CUSTOM_AI_BASE_URL y DEFAULT_AI_MODEL. Para un dominio distinto a los predefinidos, autorizar su hostname exacto con AI_ALLOWED_HOSTS tras verificar al proveedor. Las claves no se exponen en el frontend.

## Android

El owner dispone del apartado Aplicación Android dentro del panel administrativo. npm run android:preview prepara un APK firmado y su manifiesto para descarga autenticada. npm run android:bundle genera el AAB. Incrementar versionCode en mobile.config.json al actualizar Android; conservar la clave de firma. Las actualizaciones web requieren desplegar la web, y se reciben al recargar.

El APK abre https://picks777.vercel.app. La publicación en Play Store tiene pendientes de contacto, privacidad y pruebas físicas; véanse [ANDROID-RELEASE.md](ANDROID-RELEASE.md) y el informe de auditoría.

## Membresías vinculadas a cuentas

El primer canje exige una sesión Google verificada y vincula el código a un único ID de usuario mediante una transacción atómica. El vencimiento es primer canje + duración × 24 horas, sin renovarse al volver a entrar. Otra cuenta no puede usarlo; eliminarlo conserva una marca para impedir recrear el mismo código. Después de vencer no se recupera la prueba gratuita. Google restaura automáticamente el VIP mientras siga vigente. OWNER_GOOGLE_EMAIL desactiva el acceso Owner mediante código maestro.
