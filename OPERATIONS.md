# Operación segura

## Configuración

Producción (incluido Vercel) exige owner aleatorio de 32–128 caracteres, SESSION_SECRET distinto de al menos 32 caracteres y Redis REST HTTPS. No hay fallback local de acceso ni del limitador. No se registran códigos, cookies, IP sin hash ni claves. Los logs de la infraestructura también deben redactar cuerpos y cabeceras sensibles; no activar trazas HTTP con credenciales.

### Límites

Ventanas fijas desde el primer consumo, atómicas para todos los buckets mediante Lua/Redis:

| Variable | Predeterminado |
|---|---:|
| AUTH_MAX_ATTEMPTS | 20 por IP |
| AUTH_GLOBAL_MAX_ATTEMPTS | 300 globales |
| AUTH_WINDOW_SECONDS | 900 |
| AI_MAX_ANALYSES | 20 por código VIP / owner |
| AI_WINDOW_SECONDS | 3600 |
| AI_GLOBAL_MAX_ANALYSES | 200 globales |
| AI_GLOBAL_WINDOW_SECONDS | 86400 |

Son enteros positivos; no hay valor 0 para desactivar. Las cuotas cuentan solicitudes de informe, incluso cacheadas, inválidas o con fallo del proveedor. No se reembolsan para evitar carreras y abuso. Un 429 incluye `Retry-After` en segundos. Redis/configuración/identidad no disponible: 503, Retry-After 30 y ninguna llamada IA. Solo desarrollo permite contadores en memoria acotados; reiniciar desarrollo los reinicia.

La identidad de autenticación procede del socket en servidores normales (no se confía en `X-Forwarded-For`); detrás de un proxy los clientes pueden compartir ese límite. Vercel utiliza exclusivamente `x-vercel-forwarded-for`, sobrescrito por su ingress. Debe verificarse en la preview que no puede falsificarse y que contiene una IP única válida; si falta o es inválido se bloquea el acceso. No activar `trust proxy=true` indiscriminadamente. Los límites globales acotan ataques distribuidos, aunque también pueden causar denegación de servicio legítimo: monitorizar 429 sin registrar identificadores sensibles.

La cuota IA VIP se comparte por código y persiste al borrar cookies. Owner no está exento. Esto no cambia la política de códigos compartidos ni equivale a contar personas.

### Autenticación con Google & Vercel

Para activar el botón oficial de Google Identity Services (GIS) en Vercel, agrega en las Variables de Entorno de Vercel (Settings -> Environment Variables):
- `GOOGLE_CLIENT_ID`: ID de cliente OAuth 2.0 creado en Google Cloud Console (tipo Aplicación Web), agregando tu dominio de Vercel a "Orígenes de JavaScript autorizados".
- La plataforma cuenta además con soporte de inicio rápido con cuenta de Google para entornos de vista previa y desarrollo local.

## Antes de desplegar

El titular debe confirmar revocación y sustitución de todas las credenciales expuestas. Usar Redis y credenciales separados para preview, no conectar pruebas deterministas a servicios reales. No promover sin resultados de pruebas, lint/build, HTTPS/cookies, autorización, persistencia entre instancias, revocación, límites, caídas y aprobación explícita del responsable.
