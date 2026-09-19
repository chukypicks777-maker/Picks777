# Corrección de conexiones de IA — 18 de septiembre de 2026

## Problemas confirmados

- El catálogo de AgentRouter sustituía errores por cinco modelos fijos y asignaba saldo según el nombre del modelo, sin consultar la cuenta.
- El formulario y el servidor reemplazaban silenciosamente modelos por `deepseek-v4-flash`.
- Las pruebas podían reutilizar la clave guardada al cambiar de proveedor o URL. La interfaz también mantenía claves en localStorage y mostraba «CONECTADO» por tener una clave.
- Las solicitudes mezclaban protocolos y enviaban cabeceras que imitaban Claude CLI. Algunos modelos recibían simultáneamente dos límites de tokens incompatibles. Los reintentos podían superar el límite de 60 segundos de Vercel.
- Un fallo de guardado remoto se presentaba como un guardado local exitoso.

## Comportamiento corregido

Catálogos obtenidos únicamente de la API, errores diferenciados con estado HTTP, selección de modelo explícita, claves asociadas al proveedor y URL normalizados, guardado confirmado por servidor y sin claves en localStorage. Una prueba exitosa exige texto final del proveedor; el razonamiento sin respuesta no cuenta como éxito.

Una solicitud por prueba, con límite de 45 segundos. Gemini usa su API nativa; Claude en AgentRouter usa Messages; los demás usan Chat Completions. No se modifican automáticamente URLs ya guardadas. El preset de AgentRouter usa agentrouter.org, donde se emiten los tokens enlazados desde el panel. No se presupone que esos tokens sean válidos en co.agentrouter.org.

## Verificación

- `npm test`: 44 pruebas aprobadas, incluidas regresiones de protocolos, WAF, autenticación, cuotas, respuestas vacías, aislamiento de claves y flujo HTTP de guardar/reabrir/probar. Estas pruebas usan respuestas controladas exclusivamente en los tests.
- `npm run lint`: sin advertencias ni errores.
- `npm run build`: correcto; aviso de tamaño del bundle mayor a 500 kB.
- Interfaz compilada en servidor local y almacenamiento temporal aislados: OpenRouter devolvió un catálogo real de 446 modelos; AgentRouter sin clave mostró cero modelos y el error correspondiente; Probar Conexión sin clave falló sin mostrar éxito.
- Sesión real en la versión publicada, sin guardar cambios: el endpoint original de AgentRouter continuó mostrando el bloqueo del proveedor; el endpoint alternativo devolvió un error de autenticación. Se restauró el endpoint original en el formulario.

No se obtuvo una respuesta de generación exitosa con una clave real usando la versión corregida. Las pruebas automáticas no demuestran disponibilidad, cuota ni autenticación de una cuenta real. Las credenciales no se incluyen en estos archivos.

## Seguimiento: persistencia de la clave sin catálogo

El guardado ya no exige un modelo: conserva explícitamente el modelo vacío y permite guardar la clave del servidor cuando el proveedor bloquea su catálogo. La prueba de generación sigue exigiendo un modelo y no realiza llamadas con un modelo pendiente. El panel diferencia esta situación.

Prueba directa con la clave proporcionada por el titular: agentrouter.org devolvió HTTP 401 con `unauthorized client detected` tanto al consultar modelos como al intentar la generación. co.agentrouter.org devolvió HTTP 401 `Invalid API Key`. El primer error se clasifica ahora como cliente no autorizado, sin asegurar que la clave sea inválida. No se obtuvo una generación exitosa ni se modificaron las protecciones del proveedor.

Verificación: 44 tests aprobados, incluyendo guardar/reabrir la clave con modelo pendiente y ausencia de llamadas de generación sin modelo; lint limpio y build correcto.

## Almacenamiento de producción confirmado

La verificación después de recargar mostró que Vercel usaba `serverless-memory`: el archivo temporal no conservaba la clave entre instancias. Se añadió `AI_DEFAULT_CONFIG`, una variable secreta de producción con la configuración completa, como valor predeterminado duradero. En Vercel sin Redis tiene prioridad frente al archivo temporal. El panel rechaza nuevos guardados temporales para no afirmar una persistencia inexistente. Con Redis se mantiene el guardado normal en la base.

La clave se configura desde Vercel, nunca en Git ni en el frontend. El estado de salud consulta la configuración efectiva. Validación ampliada: 45 pruebas aprobadas, lint limpio y compilación correcta.
