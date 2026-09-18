# Validación de mercados, datos y administración — 17 de septiembre de 2026

## Cambios entregados

- Córners de equipo y partido: líneas +5.5 y −5.5; umbrales calculados, no solo renombrados.
- Tarjetas amarillas totales: +3.5 / −3.5. Se interpretó «+3.4» del pedido como +3.5 para mantener medias líneas; ambas condiciones superiores equivalen a al menos cuatro tarjetas. No se incluyen puntos por tarjetas ni rojas.
- Primera y segunda mitad: probabilidades más/menos de 0.5, 1.5, 2.5 y 3.5 goles, sin momios. Mínimo cinco partidos completos por equipo; se excluyen registros incompletos, futuros y con prórroga. Incluye descuento.
- Un único modelo Poisson alimenta goles individuales, totales, marcador, distribución y picks. La suma de medias por mitad coincide con la media del partido. Los mercados complementarios suman 100% y son monótonos entre líneas. Un marcador modal y un resultado agregado son eventos diferentes, explicado en pantalla.
- Se eliminaron probabilidades, cuotas, estadísticas, clasificación y ajustes de marcador inventados. Faltantes muestran N/D; no se permite agregar selecciones sin cuota publicada ni varias selecciones del mismo partido al parlay.
- Porcentajes enteros, distribución con un decimal y otros valores con máximo dos decimales. Sin animaciones que presenten porcentajes intermedios falsos.
- Los textos del informe se construyen a partir de hechos y estimaciones disponibles. El proveedor IA solo selecciona identificadores de hechos autorizados; cifras y narrativas arbitrarias no se incorporan. Fallos del proveedor usan una base estadística identificada.
- Panel Owner → Grupos y comunidad permite guardar nombre, referencia y URL de Telegram, WhatsApp e Instagram. Persistencia con revisión para evitar sobrescrituras simultáneas; enlaces compartidos por toda la interfaz. Navegación Owner disponible en móvil.
- Correcciones de respuestas obsoletas durante búsquedas rápidas y cambios de partido.

## Seguridad revisada

Se eliminaron el acceso administrativo por cabecera x-admin-key, la aceptación de perfiles Google enviados por el cliente y la decodificación de tokens sin verificación. Se exige validación de identidad por Google/Firebase y sesión firmada con rol Owner para modificaciones administrativas. Se añadieron controles de origen/JSON, validación de URLs y dominios, límites de campos y destinos permitidos para proveedores IA, sin redirecciones externas. Se retiró la creación automática del código VIP público; se conservó el acceso rápido Owner solicitado.

En producción se requieren MASTER_ADMIN_CODE propio de al menos 16 caracteres y SESSION_SECRET propio de al menos 32. En Vercel se requieren UPSTASH_REDIS_REST_URL (HTTPS) y UPSTASH_REDIS_REST_TOKEN para conservar grupos, configuración y accesos entre instancias; la API rechaza configuraciones inseguras. Localmente se utiliza el archivo de almacenamiento existente. AI_ALLOWED_HOSTS permite destinos personalizados de IA administrados por el operador. No se modificaron secretos ni configuración desplegada.

## Comprobaciones ejecutadas

- `npm test`: **37 pruebas aprobadas**, cero fallos. Incluyen 401 tasas Poisson, 121 pares de equipos, complementos, monotonía, redondeo a 100%, ceros, datos ausentes, muestras insuficientes, mitades, rechazo de cifras inventadas por IA, autenticación, permisos, CSRF, SSRF, URLs, concurrencia de grupos y renderizado de números.
- `npm run lint`: aprobado.
- `npm run build`: aprobado.
- `npm audit --json`: cero vulnerabilidades conocidas reportadas. Evidencia: [dependency-audit.json](artifacts/dependency-audit.json).
- Auditoría de red de solo lectura: feed de **76 partidos**, tres detalles, **18 métricas** contrastadas contra respuestas nuevas de ESPN, **cero discrepancias**; dos partidos con muestra suficiente para mitades. Evidencia con fecha, partidos y muestras: [live-data-audit.json](artifacts/live-data-audit.json). Repetible con `node scripts/audit-live-data.mjs`.
- Navegador local: guardado y recarga de enlaces, actualización inmediata de enlaces públicos, detalle Espanyol–Elche, mercados 5.5/3.5, ambas mitades, clasificación ESPN y acceso Owner en móvil. Pantallas de escritorio y 390×844; sin desbordamiento horizontal de documento en móvil. Sin errores de consola en la versión corregida inspeccionada.
- Pruebas de escritura ejecutadas en almacenamiento temporal aislado, sin cambiar los grupos reales del usuario. El servidor auxiliar y los scripts de transformación fueron retirados.

## Límites de la validación

La auditoría compara respuestas del mismo proveedor; no constituye confirmación independiente de cada partido. Comprueba consistencia y extracción, no calibración predictiva: no se realizó un backtest temporal independiente y no se afirma una tasa de acierto. Los porcentajes son estimaciones matemáticas sobre registros de ESPN, nunca certezas. Las pruebas de IA y autenticación usan respuestas controladas; no se consumió un proveedor IA de pago ni se inició sesión con una cuenta Google real. Las pruebas de concurrencia verifican almacenamiento local; Redis conserva el mecanismo CAS existente, sin prueba contra una instancia de producción. La revisión de seguridad y el audit de dependencias no garantizan ausencia de vulnerabilidades desconocidas.

No se desplegó a producción ni se publicaron cambios.
