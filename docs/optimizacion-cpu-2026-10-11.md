# Optimización de CPU de Picks777 — 11 de octubre de 2026

Fluid Active CPU mide el tiempo que las funciones de Vercel ejecutan código. No es
el porcentaje de ocupación instantánea del servidor ni el tiempo esperando una
respuesta de ESPN, Redis o la IA. La captura muestra 161 de 240 minutos utilizados
(67,1 %) en los últimos 30 días, con 79 minutos restantes. Haber gastado esos
minutos no demuestra que exista una avería. Si se supera la cuota de Hobby, Vercel
puede pausar el servicio; pagar Upstash no amplía la cuota de Vercel.

Referencias: [CPU de Fluid Compute](https://vercel.com/docs/functions/usage-and-pricing)
y [límites de Hobby](https://vercel.com/docs/plans/hobby).

## Cambios

- Fútbol: conservar hasta 512 resultados exactos de la inversión del precio del
  empate. Con las mismas probabilidades y correlación se reutiliza el resultado;
  nuevas cuotas o parámetros generan un cálculo nuevo. La búsqueda anterior
  repetía unas 2.000 resoluciones internas por partido con la misma cotización.
- Ajuste estadístico compartido: calcular una sola vez las sumas de resultados
  observados y sus pesos constantes, conservando el orden original de operaciones.
  Las iteraciones siguen ajustando la fuerza de ataque y defensa como antes.
- NBA/WNBA: conservar hasta 48 ajustes de historial, además de la caché anterior
  por objeto. La firma incluye competición, hora de corte, equipos, fechas y
  marcadores anteriores. Las copias del mismo historial pueden reutilizar el
  ajuste; un marcador corregido o un resultado nuevo cambia la firma.

Estas cachés viven en la memoria de cada instancia. Se vacían cuando la instancia
se reinicia y tienen límites para evitar crecimiento sin control. No añaden
consultas a Redis ni llamadas a la IA, ni retrasan la consulta de nuevos datos.
Las probabilidades, los momios y los parámetros del modelo permanecen iguales.

## Medición local

Comparación con el commit `6279af9b5f9ce392bb6005773c342bdd436d9bb5`. Se usan archivos
históricos ya disponibles, sin solicitudes a proveedores. La medición suma CPU de
usuario y sistema de Node y toma la mediana de cinco ejecuciones por carga,
después de un calentamiento.

| Carga por ejecución | CPU anterior | CPU optimizada | Reducción |
| --- | ---: | ---: | ---: |
| 10 recorridos de 80 cotizaciones de fútbol | 1.640 ms | 391 ms | 76,2 % |
| 1.000 ajustes estadísticos de 380 resultados | 1.235 ms | 1.031 ms | 16,5 % |
| 50 ajustes NBA con historial clonado de 1.235 resultados | 172 ms | 140 ms | 18,6 % |

Es una medición de estas cargas locales repetidas, no de todo el consumo de Vercel.
No implica una reducción del 76 % en la factura ni garantiza permanecer dentro
de cuatro horas. El tráfico, las cotizaciones nuevas, los arranques de instancias,
otros endpoints y el coste de procesar respuestas también influyen. Los minutos
ya consumidos no se recuperan al publicar este cambio.

Los 97 casos comparados conservan exactamente la salida anterior: 16 ajustes con
distintos pesos y priors, 80 pronósticos con cuotas y un pronóstico NBA. Las fechas
del conjunto de ajuste de fútbol se distribuyen artificialmente para esta prueba
de rendimiento; no se usa para estimar aciertos deportivos. Los datos locales son
`E0-2526.csv` y `espn-nba-202510-202604.json`.

Para repetir, guardar los módulos del commit de referencia como
`footballModel-before.mjs` y `basketballRatings-before.mjs` en un directorio local,
cambiar únicamente el import del segundo a `./footballModel-before.mjs`, y ejecutar:

```powershell
node --import ./tests/setup.js scripts/measure-cpu-optimization.mjs <directorio-baseline> <directorio-datos>
```

Resultado: `artifacts/cpu-optimization/measurement-2026-10-11.json`.

## Validación

- Suite completa: 225 pruebas aprobadas, cero fallos.
- Pruebas nuevas de cambios de cuotas, correlación, corrección de marcadores,
  copias del historial y exclusión de resultados posteriores a la hora de corte.
- Lint aprobado y compilación de producción aprobada.

La revisión del consumo real se hace en Vercel → Usage → Fluid Active CPU,
comparando los siguientes días con un tráfico parecido. El acumulado de los
últimos 30 días puede seguir subiendo mientras entran días nuevos; interesa mirar
también el consumo diario después de publicar.
