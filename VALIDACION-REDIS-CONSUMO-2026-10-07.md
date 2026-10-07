# Optimización de transferencia Redis — 7 de octubre de 2026

El panel de Upstash informó que `upstash-kv-teal-planet` estaba suspendida por superar el ancho de banda mensual: 11 GB frente a 10 GB del plan Free. Los comandos eran 179 mil de 500 mil y el almacenamiento 74 MB de 256 MB. `/api/health` devolvió HTTP 503, `storage: redis-error`; la consola rechazó PING por el límite del plan.

El tamaño almacenado no equivale a la transferencia acumulada. Descargar repetidamente los mismos JSON consume ancho de banda aunque la base no crezca y haya pocos usuarios. No se pudo consultar un desglose por clave porque el proveedor suspendió la base; no se atribuye un porcentaje de los 11 GB a un componente concreto.

## Cambios realizados

- La validación VIP, antes con hasta tres GET del registro completo, ahora selecciona usuario, código y revocación en una sola lectura atómica dentro de Redis. No se guardan permisos en caché y cada solicitud consulta el estado actual. La clave persistente `picks:v2:access` y sus transacciones de escritura se conservan; no hay migración de cuentas o códigos.
- Usuarios, códigos, configuración de IA y enlaces comunitarios también se leen por selección. Los scripts usan EVALSHA, con recarga mediante EVAL exclusivamente ante NOSCRIPT. Una consulta habitual envía el resumen de 40 caracteres en lugar del cuerpo Lua. Se restaura el formato de listas vacías que cjson codifica como objetos.
- La caché de datos usa gzip cuando el JSON tiene al menos 4 KB y la compresión reduce el tamaño, conservando valores, fuentes y vencimientos. Se aceptan los JSON anteriores sin comprimir. La caché de memoria está acotada a 250 entradas y 32 MB; las entradas Redis mayores de 16 MB se omiten.
- Los historiales de fútbol guardan solo los marcadores, mitades y estadísticas observadas que consume el cálculo. Se excluyen comentarios, noticias, imágenes y videos de esos registros. El calendario MLB guarda los encuentros normalizados, sin el resto de la respuesta del proveedor.
- Las lecturas simultáneas del mismo informe se agrupan. La ausencia comprobada de un informe se recuerda durante 15 segundos; un error de Redis no se guarda como ausencia. Una escritura invalida ese resultado. Leer informes no inicia llamadas de IA.

## Medición reproducible

Ejecutar `node scripts/measure-redis-bandwidth.mjs`. Este script consulta únicamente proveedores deportivos públicos y usa cinco cuentas ficticias para la comparación de sesiones. No lee Redis de producción ni usuarios reales. Cuenta los cuerpos JSON de una escritura y una lectura REST; no estima el total mensual ni incluye cabeceras HTTP.

| Muestra | Bytes anteriores | Bytes optimizados | Reducción |
| --- | ---: | ---: | ---: |
| Calendario de fútbol, ESPN, jornada 21/09/2025 | 74.094 | 13.058 | 82,38 % |
| Resumen histórico de fútbol, ESPN, partido 740644 | 914.262 | 6.844 | 99,25 % |
| Calendario MLB, 20/09–07/10/2026 | 1.293.576 | 27.074 | 97,91 % |
| Validación VIP, muestra ficticia de cinco cuentas, script ya cargado | 6.381 | 554 | 91,32 % |

Un resumen histórico real pasó de 405.300 bytes de datos a 2.840 bytes de estadísticas pertinentes. Se comprobó que `readHistoricalSummary` obtiene exactamente los mismos resultados para ambos equipos. Las muestras comprimidas recuperan los datos completos sin cambios.

Evidencia: [medición JSON](artifacts/redis-bandwidth-measurement-2026-10-07.json).

## Validación

Pasaron las 186 pruebas de Node, `npm run lint` y `npm run build`. Las pruebas nuevas cubren selección de datos con ejecución del script Lua, listas vacías, lectura compacta, revocación inmediata, cuenta eliminada, caída del almacenamiento, recarga tras vaciar el caché de scripts, compatibilidad de caché anterior, compresión sin pérdida, datos corruptos, límites de tamaño, caducidad, agrupación de lecturas y estadísticas ausentes o cero.

La frontera Redis se simula de forma aislada y el script real se ejecuta en Fengari. No es una prueba contra Upstash ni un servidor Redis real. Docker no estaba disponible y la revisión automática bloqueó descargar y ejecutar el servidor Redis de prueba; se usó este intérprete JavaScript como alternativa. La nueva dependencia Fengari pertenece solo a desarrollo y pruebas.

Logs: [pruebas](artifacts/redis-bandwidth-unit-2026-10-07.txt), [lint](artifacts/redis-bandwidth-lint-2026-10-07.txt), [compilación](artifacts/redis-bandwidth-build-2026-10-07.txt). La compilación conserva el aviso existente de tamaño del bundle.

## Estado de entrega

La publicación de esta optimización fue autorizada el 7 de octubre de 2026. La reducción se aplica a las nuevas solicitudes después de desplegar. La optimización no borra el consumo mensual ya acumulado ni reactiva una base suspendida por el proveedor. El resultado del despliegue se registra en `artifacts/redis-bandwidth-publication-2026-10-07.json`. Falta reactivar esa misma base y verificar en producción la lectura compacta, el estado de salud y el consumo del siguiente período. No se cambió el plan de pago ni se eliminaron datos.
