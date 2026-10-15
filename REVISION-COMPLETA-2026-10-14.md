# Revisión completa de la app — 14 de octubre de 2026

Se revisaron cuatro áreas con datos reales del día: parlay, fútbol, estadísticas, y momios con las páginas de béisbol, tenis y básquet. Cada hallazgo se comprobó antes de corregirlo.

## Parlay

- **"+ Al Parlay" no hacía nada en fútbol:** fallaba en las tarjetas con análisis de IA, la mayoría, porque esos picks no traían el partido. Ahora todos los picks llevan el partido y la hora de inicio.
- **Partidos ya empezados:** antes seguían contando en la cuota total. Ahora no se pueden agregar, se marcan "Ya empezó · fuera del cálculo" y hay un botón para quitarlos.
- **Tipo de momio:** cada selección dice si su momio es "Momio justo" (calculado) o "Publicado", también en el ticket copiado.
- **NPB/KBO:** el boleto avisa que un empate anula esa selección (cuenta como 1.00) en vez de perder el ticket.
- **Montos:** salen en formato mexicano ($ 12,345.67).
- **Juegos que quizá no se jueguen:** los juegos de playoffs MLB "si es necesario" no se pueden agregar.
- **Identificadores de Corea:** los IDs de partidos KBO ya no cambian si se reprograma otro juego del mes.
- **Servidor:** ya no devuelve un error técnico si recibe un parlay vacío.

## Fútbol

- **Partidos en vivo o terminados:**
  - Ya no se calculan porcentajes a partir de las cuotas de cierre ni de promedios. Antes, un 3-0 en vivo mostraba "Over 1.5 79%".
  - Las cuotas que quedan dicen "Cierre", no "Publicado".
  - Se ocultan los mercados previos de mitades, córners y tarjetas.
- **Banqueros:** solo incluye partidos por jugar con pick. Antes se llenaba con partidos en vivo sin pick. Se quitó el filtro "En Vivo" de Banqueros.
- **Partido destacado:** muestra el pick más seguro por jugar, no el primer partido en vivo con "N/D".
- **Champions League:** no se comparan promedios de goles de ligas distintas. Antes Aston Villa–Viking daba Viking 66% al comparar goles de Inglaterra con los de Noruega. Si no hay datos comparables, queda N/D, igual en la tarjeta y en el análisis.
- **1X2:** nunca suma 101%, y el pick de doble oportunidad coincide con el 1 y la X que muestra la tarjeta.
- **Minuto en vivo:** antes la tarjeta no lo mostraba y el análisis decía "52''". Ahora aparece bien en los dos.

## Estadísticas

- **Rachas (W/D/L):** ahora salen de los resultados reales de la liga, del más antiguo al más reciente. La racha de ESPN venía al revés y a veces con la última letra equivocada (Chelsea marcaba D cuando ganó 5-1).
- **Vallas invictas:**
  - Se cuentan con los equipos de cada partido. Antes una derrota 0-3 en casa contaba como valla invicta: Slovan marcaba 40% y era 20%.
  - El marcador de la lista se muestra propio–rival.
  - La etiqueta dice "últimos partidos de liga", que es lo que mide. Antes decía "Temporada".
- **Amistosos:** ya no cuentan como resultados oficiales.
- **Tablas de posiciones:** MLS, Liga MX Femenil y Leagues Cup salen ordenadas.
- **Básquet:** "Cómo llegan los equipos" usa solo partidos de esta temporada. Antes mezclaba la del año pasado.

## Momios y páginas de deportes

- **Juegos "si es necesario" en MLB:** se marcan "Juego N de 7 · solo si es necesario" y no entran en Banqueros ni en el parlay.
- **Banqueros:** una sola selección por serie. Antes SoftBank ocupaba seis lugares con el mismo pick, uno por cada juego de la serie.
- **Ventana de análisis:** ya no muestra momios ni estado viejos de la vista Banqueros.
- **Lluvia en MLB:** un retraso ya no borra el partido en vivo. Antes aparecía "DELAYED", sin marcador y con N/D.
- **Formatos de momio:**
  - 1.909 se muestra 10/11, 2.65 se muestra 33/20 y 1.0625 se muestra 1/16.
  - Un momio que se ve como 2.00 en decimal ahora es +100 en americano, ya no −101.
  - Ningún momio baja de 1.01.
- **Reloj de las tarjetas de deportes:** siempre marcaba la hora 0. Por eso un juego de NPB/KBO que ya empezó nunca pasaba a "sin confirmar".
- **Textos del análisis:**
  - Japón y Corea decían "Muestra verificada: 0 partidos" junto a un 12.8% de extra innings. Ahora explican de dónde sale el porcentaje.
  - El informe de IA ahora usa la temporada completa como muestra.
  - El informe ahora dice cuándo se incluyeron bajas de la NBA o abridores de MLB.

## Pendiente de decisión del dueño (no se cambió)

En fútbol, el 1X2 y el Over/Under 2.5 usan el mercado sin margen cuando hay cuota publicada (está documentado). Pasarlo a modelo 100% propio requiere primero un modelo para equipos de Champions sin datos comparables.

## Verificación

- 244 pruebas automáticas.
- 3,393 controles de coherencia sobre todos los calendarios en vivo: 0 errores.
- Compilación sin errores.
