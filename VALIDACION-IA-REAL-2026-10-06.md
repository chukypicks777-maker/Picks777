# Comprobación de respuestas reales de IA

Entre las 03:57:54 y las 03:58:18 UTC del 6 de octubre de 2026 se forzaron cuatro solicitudes nuevas al proveedor configurado, una para fútbol, béisbol, tenis y básquetbol. No se reutilizó la caché de informes ni se simularon las respuestas del proveedor.

Las cuatro solicitudes recibieron HTTP 200. El modelo solicitado y el modelo declarado por las respuestas coinciden en `deepseek-v4.1`. Se registraron el momento de solicitud, duración, uso de tokens, identificadores elegidos y hashes del contenido enviado y recibido. No se guardaron claves, cabeceras de autorización ni credenciales.

Cada encuentro se obtuvo de los servicios deportivos reales de la aplicación. La auditoría comprobó que los hechos elegidos pertenecen al catálogo enviado, que el informe confirma la validación y que sus porcentajes coinciden con el cálculo estadístico. También verificó que la llamada no modifica los datos de entrada. El informe solo se considera completado con IA después de una respuesta válida del proveedor.

La función actual de la IA es revisar y priorizar los hechos del catálogo: datos del encuentro, fuente, historial, muestras, método, probabilidades y limitaciones. Los porcentajes, momios teóricos y selecciones son calculados por el modelo estadístico. La IA no consulta lesiones o noticias externas ni elabora una predicción numérica independiente. Este alcance aparece identificado en el informe como `fact-selection` y no como un análisis profundo libre.

La primera ejecución detectó que el proveedor devolvía todos los identificadores del catálogo de béisbol, excediendo el máximo permitido. Esa respuesta fue rechazada y no se presentó como IA válida. Se añadió un reintento limitado con el mismo modelo para pedir una selección real. Una segunda respuesta inválida sigue siendo rechazada; no se recorta silenciosamente la lista para anunciar un análisis completado. La prueba unitaria nueva verifica ambos casos y la conservación de las probabilidades.

Evidencia reproducible: `scripts/verify-ai-real.mjs` y `artifacts/ai-real-verification-2026-10-06.json`. Las respuestas se observaron a través de la conexión HTTP real; la comprobación no certifica la implementación interna del modelo del proveedor ni su precisión predictiva futura.

La suite unitaria completa aprueba 174 pruebas y conserva los controles contra probabilidades, resultados, cuotas y afirmaciones inventadas. La comprobación de datos deportivos y la regresión de navegación, diseño y permisos se documentan en `VALIDACION-CARGA-PERSISTENCIA-2026-10-05.md`.
