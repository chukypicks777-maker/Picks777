# Comparación final con Caliente — 15 de octubre de 2026

Se tomaron los momios de Caliente.mx de 21 páginas: fútbol (Liga MX, Liga MX Femenil, Premier, LaLiga, Serie A, Ligue 1, MLS, Champions), béisbol (MLB, NPB, LMP), básquet (NBA, WNBA) y tenis (Shanghái, Wuhan y WTA 125). A cada momio se le quitó el margen de la casa. Luego se compararon con el porcentaje y el pick que muestra la app.

Regla del dueño: los porcentajes salen del modelo propio. Los momios solo se usan para medir la distancia.

## Resumen

| Categoría | Partidos comparados | Diferencia media | Mismo favorito | Picks de la app que la casa también favorece |
|---|---:|---:|---:|---:|
| Fútbol | 89 | **1.8 pts** | **89 / 89** | **24 / 24** |
| Básquetbol | 17 | 7.7 pts | 15 / 17 | 15 / 17 |
| Tenis | 18 | 6.7 pts | 14 / 18 | 14 / 18 |
| Béisbol | 7 | 7.6 pts | 3 / 7 | 3 / 7 |

Los 39 partidos de fútbol que Caliente ya publica para la semana siguiente (23–26 de octubre) todavía no entran en la ventana de la app, que muestra 6 días.

## Qué se corrigió con esta revisión

- **Champions League sin momio:** Inter–Shakhtar salía Inter 49.6% (la casa: 78%). Shakhtar solo tenía 4 partidos de Champions en el historial y el modelo lo trataba como promedio. En copas ahora se exigen 10 partidos por equipo; si no los tiene, queda N/D hasta que haya momio publicado.
- **Ligas de invierno sin precisión comprobada:** en la prueba a ciegas de 2025-26, el modelo acertó en la LMP Pacífico (55–57%, mejor que la ventaja de local). En Venezuela (LVBP) y Dominicana (LIDOM) le fue igual o peor que tirar una moneda. Por decisión del dueño, esas ligas se quitaron de la app, junto con Puerto Rico, Australia y la Serie del Caribe (sin datos para probarlas). Queda solo la LMP Pacífico. Script: `scripts/backtest/experiment-winter-start.mjs`.

- **Europa League agregada:** la app no la tenía. ESPN la publica con todos sus partidos. Usa la misma regla que la Champions: si un equipo tiene menos de 10 partidos de copa y no hay momio publicado, el partido queda en N/D.

## Diferencias que siguen y por qué

- **Liga MX Femenil:** Toluca–Santos sale 63% en la app contra 79% en la casa, y León–Atlante 58% contra 71%. ESPN solo publica esta liga desde agosto de 2026 (89 partidos), así que el modelo aplana a los equipos dominantes. Mejorará conforme se jueguen partidos.
- **NPB:** Hanshin–DeNA sale 50% contra 62% en la casa. En los últimos 60 días DeNA va 26-15 (+1.05 carreras por juego) y Hanshin 21-18 (+0.42), y DeNA ganó el juego 1 de la final. La casa probablemente le da ventaja a Hanshin por su abridor, y los abridores de Japón no se pueden leer de forma confiable.
- **Básquet:** Pelicans–Pacers, Nets–Hornets y Wizards–Bucks son equipos que cambiaron mucho en el verano. Esos partidos muestran el aviso de diferencia con la casa y no entran en Banqueros.
- **Tenis:** Svitolina–Kartal y Andreescu–Stefanini difieren porque el modelo usa los puntos del ranking, y Kartal y Andreescu tienen ranking bajo por lesiones o inactividad.

## Tabla completa

| Categoría | Partido | App % | Caliente % (sin margen) | Dif. local | Pick de la app |
|---|---|---|---|---|---|
| Fútbol | Necaxa vs Atlas | 37.9 / 26.5 / 35.6 | 37.3 / 27.4 / 35.3 | 0.6 | Más de 1.5 Goles 79% |
| Fútbol | Atlante vs Pumas UNAM | 38.5 / 26.8 / 34.7 | 37.8 / 26.6 / 35.5 | 0.7 | Más de 1.5 Goles 78% |
| Fútbol | Tijuana vs Puebla | 54.4 / 24 / 21.6 | 52.8 / 25.2 / 22 | 1.5 | Más de 1.5 Goles 79% |
| Fútbol | Santos vs Querétaro | 39.5 / 26.4 / 34.1 | 38.9 / 26.2 / 34.9 | 0.5 | Más de 1.5 Goles 81% |
| Fútbol | Guadalajara vs Tigres UANL | 52.3 / 26.2 / 21.5 | 50.1 / 25.1 / 24.8 | 2.1 | GDL o Empate (1X) 78% (casa 75.2%) |
| Fútbol | León vs América | 29.1 / 26.5 / 44.4 | 30.5 / 26.6 / 42.9 | 1.3 | Más de 1.5 Goles 80% |
| Fútbol | Toluca vs Atlético de San Luis | 73.6 / 15.4 / 11 | 70.7 / 17.7 / 11.6 | 2.9 | TOL o Empate (1X) 89% (casa 88.4%) |
| Fútbol | Cruz Azul vs FC Juárez | 73.6 / 16.2 / 10.2 | 71.1 / 20.3 / 8.6 | 2.5 | CAZ o Empate (1X) 90% (casa 91.4%) |
| Fútbol | Monterrey vs Pachuca | 56.8 / 21.9 / 21.3 | 55 / 23.8 / 21.1 | 1.8 | Más de 1.5 Goles 82% |
| Fútbol | Everton vs Chelsea | 30.1 / 25.1 / 44.9 | 29.9 / 25.1 / 44.9 | 0.1 | Más de 1.5 Goles 80% |
| Fútbol | Manchester City vs Ipswich Town | 79.7 / 12.3 / 8 | 75.8 / 15.7 / 8.5 | 3.9 | MNC o Empate (1X) 92% (casa 91.5%) |
| Fútbol | Fulham vs Hull City | 56.9 / 23.4 / 19.8 | 55.3 / 24.2 / 20.5 | 1.6 | FUL o Empate (1X) 80% (casa 79.5%) |
| Fútbol | Brentford vs Liverpool | 40.2 / 25.6 / 34.2 | 39.3 / 25.5 / 35.2 | 0.9 | Más de 1.5 Goles 83% |
| Fútbol | Newcastle United vs Aston Villa | 43 / 25.2 / 31.8 | 43.3 / 25.8 / 30.9 | 0.3 | Más de 1.5 Goles 82% |
| Fútbol | Leeds United vs Manchester United | 40.1 / 26.3 / 33.6 | 40.8 / 26.3 / 32.9 | 0.7 | Más de 1.5 Goles 81% |
| Fútbol | AFC Bournemouth vs Sunderland | 46 / 26.6 / 27.4 | 45.1 / 26.8 / 28 | 0.9 | Más de 1.5 Goles 77% |
| Fútbol | Brighton & Hove Albion vs Crystal Palace | 62.6 / 20.3 / 17.2 | 60.8 / 21.4 / 17.8 | 1.8 | BHA o Empate (1X) 83% (casa 82.2%) |
| Fútbol | Nottingham Forest vs Arsenal | 15.2 / 24 / 60.8 | 17.8 / 24.5 / 57.8 | 2.5 | ARS o Empate (X2) 85% (casa 82.2%) |
| Fútbol | Tottenham Hotspur vs Coventry City | 65.9 / 19.5 / 14.7 | 65.2 / 21 / 13.9 | 0.7 | TOT o Empate (1X) 85% (casa 86.1%) |
| Fútbol | Deportivo vs Levante | 46 / 27.4 / 26.6 | 44.1 / 27.3 / 28.6 | 2 | Más de 1.5 Goles 76% |
| Fútbol | Espanyol vs Atlético Madrid | 19.4 / 23.8 / 56.9 | 20.7 / 24.2 / 55.1 | 1.3 | ATM o Empate (X2) 81% (casa 79.3%) |
| Fútbol | Villarreal vs Elche | 67.8 / 18.3 / 13.9 | 65.8 / 18.9 / 15.3 | 2 | VIL o Empate (1X) 86% (casa 84.7%) |
| Fútbol | Real Betis vs Barcelona | 15 / 16.4 / 68.7 | 15.2 / 17.1 / 67.7 | 0.2 | Más de 1.5 Goles 89% |
| Fútbol | Valencia vs Athletic Club | 28.8 / 28.3 / 42.9 | 28.6 / 28.2 / 43.3 | 0.2 | Menos de 3.5 Goles 75% |
| Fútbol | Osasuna vs Racing Santander | 48.3 / 25.7 / 26 | 47.4 / 26.1 / 26.5 | 0.9 | Más de 1.5 Goles 81% |
| Fútbol | Celta Vigo vs Alavés | 45.9 / 28.5 / 25.6 | 44.1 / 28.2 / 27.7 | 1.8 | Menos de 3.5 Goles 79% |
| Fútbol | Málaga vs Real Sociedad | 28.6 / 26.5 / 44.9 | 30.5 / 26.6 / 42.9 | 1.8 | Más de 1.5 Goles 78% |
| Fútbol | Real Madrid vs Sevilla | 78.7 / 13.4 / 8 | 75.7 / 16 / 8.2 | 2.9 | RMA o Empate (1X) 92% (casa 91.8%) |
| Fútbol | Getafe vs Rayo Vallecano | 32.5 / 31.9 / 35.7 | 33.2 / 31.4 / 35.4 | 0.7 | Menos de 3.5 Goles 83% |
| Fútbol | Levante vs Athletic Club | 26 / 29.4 / 44.7 | 28.2 / 27.3 / 44.5 | 2.2 | Más de 1.5 Goles 75% |
| Fútbol | Frosinone vs Sassuolo | 38.1 / 25.5 / 36.4 | 38.3 / 25.5 / 36.2 | 0.2 | Más de 1.5 Goles 80% |
| Fútbol | Venezia vs Napoli | 20 / 22.5 / 57.5 | 19.9 / 23.9 / 56.3 | 0.2 | NAP o Empate (X2) 80% (casa 80.1%) |
| Fútbol | Bologna vs Internazionale | 16.5 / 22.4 / 61.1 | 16.9 / 23.1 / 60 | 0.5 | INT o Empate (X2) 83% (casa 83.1%) |
| Fútbol | AS Roma vs Genoa | 67 / 19.9 / 13 | 65 / 21.2 / 13.8 | 2 | ROMA o Empate (1X) 87% (casa 86.2%) |
| Fútbol | Udinese vs Lecce | 50.9 / 26.7 / 22.4 | 48.4 / 26.9 / 24.7 | 2.5 | UDI o Empate (1X) 78% (casa 75.3%) |
| Fútbol | Fiorentina vs Como | 28.5 / 25.5 / 46.1 | 28.6 / 25.9 / 45.5 | 0.2 | Más de 1.5 Goles 81% |
| Fútbol | AC Milan vs Atalanta | 53.8 / 24.1 / 22.1 | 51.7 / 25.2 / 23.1 | 2 | Más de 1.5 Goles 79% |
| Fútbol | Juventus vs Lazio | 57.5 / 24.2 / 18.3 | 55.5 / 24.8 / 19.7 | 2 | JUV o Empate (1X) 82% (casa 80.3%) |
| Fútbol | Monza vs Cagliari | 40.5 / 29.2 / 30.3 | 39.8 / 29.8 / 30.3 | 0.6 | Menos de 3.5 Goles 75% |
| Fútbol | Parma vs Torino | 30.4 / 30.9 / 38.7 | 31 / 30.5 / 38.6 | 0.6 | Menos de 3.5 Goles 81% |
| Fútbol | Le Mans vs Toulouse | 32.2 / 26.1 / 41.8 | 32.8 / 26.6 / 40.7 | 0.6 | Más de 1.5 Goles 81% |
| Fútbol | Strasbourg vs Paris Saint-Germain | 13.8 / 16.5 / 69.7 | 12.4 / 17.8 / 69.8 | 1.4 | Más de 1.5 Goles 88% |
| Fútbol | Lille vs Brest | 52.1 / 24.3 / 23.6 | 49.6 / 25 / 25.4 | 2.5 | Más de 1.5 Goles 80% |
| Fútbol | Troyes vs Lens | 24.3 / 23.6 / 52.1 | 25.9 / 23.6 / 50.5 | 1.6 | Más de 1.5 Goles 83% |
| Fútbol | Angers vs Marseille | 29.1 / 25 / 45.9 | 30.4 / 24.8 / 44.8 | 1.3 | Más de 1.5 Goles 82% |
| Fútbol | Paris FC vs Stade Rennais | 41.9 / 27.9 / 30.2 | 41.9 / 26.5 / 31.6 | 0.1 | Más de 1.5 Goles 81% |
| Fútbol | Le Havre AC vs AJ Auxerre | 41.1 / 27.6 / 31.3 | 41.7 / 27.3 / 30.9 | 0.6 | Más de 1.5 Goles 76% |
| Fútbol | Lorient vs AS Monaco | 25.2 / 27.5 / 47.3 | 26.5 / 26.9 / 46.6 | 1.3 | MON o Empate (X2) 75% (casa 73.5%) |
| Fútbol | Lyon vs Nice | 57.6 / 22.7 / 19.7 | 56.5 / 23.5 / 20 | 1.2 | Más de 1.5 Goles 81% |
| Fútbol | Philadelphia Union vs Charlotte FC | 65.3 / 18.4 / 16.3 | 62 / 20 / 17.9 | 3.3 | Más de 1.5 Goles 87% |
| Fútbol | Minnesota United FC vs St. Louis CITY SC | 39.8 / 23.7 / 36.5 | 39 / 23.9 / 37 | 0.8 | Más de 1.5 Goles 85% |
| Fútbol | Orlando City SC vs D.C. United | 56.5 / 21 / 22.5 | 54.4 / 21.4 / 24.2 | 2.2 | Más de 1.5 Goles 88% |
| Fútbol | New England Revolution vs Chicago Fire FC | 40.6 / 24.6 / 34.8 | 41 / 23.9 / 35.2 | 0.4 | Más de 1.5 Goles 84% |
| Fútbol | Red Bull New York vs Toronto FC | 47.3 / 23.3 / 29.4 | 44.1 / 23.6 / 32.3 | 3.2 | Más de 1.5 Goles 84% |
| Fútbol | Atlanta United FC vs Inter Miami CF | 29 / 21.3 / 49.8 | 29 / 21.9 / 49.1 | 0 | Más de 1.5 Goles 88% |
| Fútbol | Sporting Kansas City vs Real Salt Lake | 32.8 / 23.6 / 43.7 | 34 / 23.9 / 42.1 | 1.2 | Más de 1.5 Goles 85% |
| Fútbol | Austin FC vs Vancouver Whitecaps | 18.9 / 20.8 / 60.3 | 20.9 / 21.6 / 57.5 | 2 | Más de 1.5 Goles 84% |
| Fútbol | Houston Dynamo FC vs FC Dallas | 43.8 / 26.7 / 29.5 | 44.1 / 25.9 / 30 | 0.3 | Más de 1.5 Goles 78% |
| Fútbol | San Jose Earthquakes vs Nashville SC | 26 / 24.1 / 49.9 | 28.5 / 23.8 / 47.7 | 2.5 | Más de 1.5 Goles 83% |
| Fútbol | Portland Timbers vs Colorado Rapids | 46.1 / 24 / 30 | 44.1 / 24.5 / 31.4 | 2 | Más de 1.5 Goles 83% |
| Fútbol | Seattle Sounders FC vs CF Montréal | 65.3 / 19.3 / 15.5 | 62 / 20.9 / 17.1 | 3.3 | SEA o Empate (1X) 84% (casa 82.9%) |
| Fútbol | LA Galaxy vs San Diego FC | 46 / 23 / 31 | 44.1 / 23.6 / 32.3 | 1.9 | Más de 1.5 Goles 86% |
| Fútbol | FC Cincinnati vs Columbus Crew | 43.8 / 23.3 / 32.9 | 44.2 / 23.6 / 32.2 | 0.4 | Más de 1.5 Goles 87% |
| Fútbol | Fenerbahce vs Slavia Prague | 58.2 / 22.4 / 19.4 | 56.8 / 23 / 20.2 | 1.4 | Más de 1.5 Goles 82% |
| Fútbol | Sabah FK vs Borussia Dortmund | 10.5 / 15 / 74.5 | 10.3 / 16.4 / 73.3 | 0.2 | Más de 1.5 Goles 90% |
| Fútbol | AS Roma vs Slovan Bratislava | 84.3 / 10.7 / 5 | 82.4 / 12.2 / 5.4 | 1.9 | ROMA o Empate (1X) 95% (casa 94.6%) |
| Fútbol | FC Porto vs PSV Eindhoven | 56.2 / 21.6 / 22.2 | 55 / 22.5 / 22.5 | 1.3 | Más de 1.5 Goles 84% |
| Fútbol | Liverpool vs Villarreal | 65.3 / 19.4 / 15.3 | 64.3 / 21 / 14.8 | 1 | Más de 1.5 Goles 87% |
| Fútbol | Manchester City vs AEK Athens | 93.7 / 4.6 / 1.7 | 89.6 / 8.2 / 2.2 | 4.1 | MNC o Empate (1X) 98% (casa 97.8%) |
| Fútbol | Paris Saint-Germain vs Barcelona | 40.5 / 20.8 / 38.7 | 39.3 / 22.4 / 38.3 | 1.2 | Más de 1.5 Goles 93% |
| Fútbol | Napoli vs Bodo/Glimt | 61.8 / 20.2 / 18 | 60.9 / 21.9 / 17.2 | 0.9 | Más de 1.5 Goles 86% |
| Fútbol | VfB Stuttgart vs Atlético Madrid | 33.7 / 24.8 / 41.5 | 33.7 / 25.2 / 41.1 | 0 | Más de 1.5 Goles 84% |
| Fútbol | Como vs Manchester United | 41.5 / 24.8 / 33.7 | 40.9 / 25.4 / 33.6 | 0.6 | Más de 1.5 Goles 82% |
| Fútbol | Lille vs Galatasaray | 44.3 / 25.6 / 30 | 43.3 / 25.8 / 30.9 | 1.1 | Más de 1.5 Goles 81% |
| Fútbol | Aston Villa vs VIKING FK | 77.8 / 16.2 / 6 | 77.1 / 15.9 / 7 | 0.7 | AVL o Empate (1X) 94% (casa 93%) |
| Fútbol | Bayern Munich vs Arsenal | 44.5 / 24.7 / 30.8 | 43.3 / 25.8 / 30.9 | 1.3 | Más de 1.5 Goles 82% |
| Fútbol | Club Brugge vs Lens | 46.6 / 24.9 / 28.5 | 44.9 / 24.2 / 30.9 | 1.7 | Más de 1.5 Goles 82% |
| Fútbol | Internazionale vs Shakhtar Donetsk | N/D | 78.2 / 13.5 / 8.2 |  | N/D |
| Fútbol | Real Betis vs Feyenoord Rotterdam | 63.2 / 19.7 / 17.1 | 61.1 / 20.4 / 18.4 | 2 | Más de 1.5 Goles 87% |
| Fútbol | Real Madrid vs RB Leipzig | 75.1 / 14.4 / 10.5 | 73.9 / 15.7 / 10.4 | 1.2 | Más de 1.5 Goles 91% |
| Fútbol | Sporting CP vs LASK Linz | 77.6 / 13.1 / 9.2 | 74.5 / 14.8 / 10.7 | 3.1 | Más de 1.5 Goles 92% |
| Fútbol | Puebla vs Tijuana | 10.8 / 15.9 / 73.3 | 12 / 17.8 / 70.2 | 1.2 | Más de 1.5 Goles 90% |
| Fútbol | Monterrey vs Cruz Azul | 77.4 / 12.8 / 9.9 | 75 / 16.3 / 8.7 | 2.4 | Más de 1.5 Goles 94% |
| Fútbol | Pumas UNAM vs Atlas | 68.4 / 17.8 / 13.8 | 66.2 / 20.1 / 13.7 | 2.2 | Más de 1.5 Goles 88% |
| Fútbol | Atlético de San Luis vs FC Juárez | 21.5 / 24.5 / 54 | 22.2 / 24.5 / 53.3 | 0.7 | JUA o Empate (X2) 79% (casa 77.8%) |
| Fútbol | Tigres UANL vs Querétaro | 82.2 / 11.9 / 5.9 | 90.7 / 6.9 / 2.4 | 8.5 | TIG o Empate (1X) 94% (casa 97.6%) |
| Fútbol | América vs Pachuca | 75 / 14.7 / 10.4 | 77.2 / 15.1 / 7.8 | 2.2 | Más de 1.5 Goles 92% |
| Fútbol | Toluca vs Santos | 63.2 / 19.2 / 17.6 | 79 / 14.3 / 6.7 | 15.8 | Más de 1.5 Goles 89% |
| Fútbol | León vs Atlante | 58.2 / 22.5 / 19.3 | 70.8 / 19.3 / 9.9 | 12.6 | Más de 1.5 Goles 83% |
| Fútbol | Guadalajara vs Necaxa | 86.9 / 9.5 / 3.6 | 91.7 / 5.7 / 2.7 | 4.7 | GUA o Empate (1X) 96% (casa 97.3%) |
| Béisbol | Cleveland Guardians vs Tampa Bay Rays | 49.1 / 50.9 | 49.8 / 50.2 | 0.7 | Tampa Bay Rays gana 50.9% (casa 50.2%) |
| Béisbol | Hanshin vs DeNA | 49.7 / 50.3 | 61.5 / 38.5 | 11.8 | DeNA gana 50.3% (casa 38.5%) |
| Béisbol | SoftBank vs Nippon-Ham | 61.8 / 38.2 | 65.9 / 34.1 | 4.1 | SoftBank gana 61.8% (casa 65.9%) |
| Béisbol | Algodoneros de Guasave vs Caneros de los Mochis | 45.7 / 54.3 | 42.6 / 57.4 | 3.1 | Caneros de los Mochis gana 54.3% (casa 57.4%) |
| Béisbol | Jaguares de Nayarit vs Charros de Jalisco | 43.9 / 56.1 | 53 / 47 | 9.1 | Charros de Jalisco gana 56.1% (casa 47%) |
| Béisbol | Naranjeros de Hermosillo vs Aguilas de Mexicali | 46.6 / 53.4 | 55.2 / 44.8 | 8.6 | Aguilas de Mexicali gana 53.4% (casa 44.8%) |
| Béisbol | Yaquis de Obregon vs Mayos de Navojoa | N/D | 58.3 / 41.7 |  | N/D |
| Béisbol | Tomateros de Culiacan vs Venados de Mazatlan | 46.6 / 53.4 | 62.4 / 37.6 | 15.8 | Venados de Mazatlan gana 53.4% (casa 37.6%) |
| Básquetbol | Detroit Pistons vs Boston Celtics | 55.5 / 44.5 | 51 / 49 | 4.5 | Detroit Pistons gana 55.5% (casa 51%) |
| Básquetbol | New York Knicks vs Philadelphia 76ers | 68.6 / 31.4 | 63.9 / 36.1 | 4.7 | New York Knicks gana 68.6% (casa 63.9%) |
| Básquetbol | San Antonio Spurs vs Oklahoma City Thunder | 61.4 / 38.6 | 54.6 / 45.4 | 6.8 | San Antonio Spurs gana 61.4% (casa 54.6%) |
| Básquetbol | Orlando Magic vs Atlanta Hawks | 57.9 / 42.1 | 55.5 / 44.5 | 2.4 | Orlando Magic gana 57.9% (casa 55.5%) |
| Básquetbol | Washington Wizards vs Milwaukee Bucks | 53 / 47 | 65.9 / 34.1 | 12.9 | Washington Wizards gana 53% (casa 65.9%) |
| Básquetbol | Brooklyn Nets vs Charlotte Hornets | 23.9 / 76.1 | 45.4 / 54.6 | 21.5 | Charlotte Hornets gana 76.1% (casa 54.6%) |
| Básquetbol | Miami Heat vs Minnesota Timberwolves | 59.7 / 40.3 | 52.2 / 47.8 | 7.5 | Miami Heat gana 59.7% (casa 52.2%) |
| Básquetbol | Toronto Raptors vs Chicago Bulls | 77.1 / 22.9 | 74.5 / 25.5 | 2.6 | Toronto Raptors gana 77.1% (casa 74.5%) |
| Básquetbol | Memphis Grizzlies vs Utah Jazz | 56.8 / 43.2 | 46.8 / 53.2 | 10 | Memphis Grizzlies gana 56.8% (casa 46.8%) |
| Básquetbol | New Orleans Pelicans vs Indiana Pacers | 63 / 37 | 40.7 / 59.3 | 22.3 | New Orleans Pelicans gana 63% (casa 40.7%) |
| Básquetbol | Houston Rockets vs Dallas Mavericks | 74.8 / 25.2 | 72.4 / 27.6 | 2.4 | Houston Rockets gana 74.8% (casa 72.4%) |
| Básquetbol | Los Angeles Lakers vs Golden State Warriors | 69.8 / 30.2 | 63.4 / 36.6 | 6.4 | Los Angeles Lakers gana 69.8% (casa 63.4%) |
| Básquetbol | Portland Trail Blazers vs Phoenix Suns | 64.3 / 35.7 | 59.7 / 40.3 | 4.6 | Portland Trail Blazers gana 64.3% (casa 59.7%) |
| Básquetbol | LA Clippers vs Sacramento Kings | 65.4 / 34.6 | 58.2 / 41.8 | 7.2 | LA Clippers gana 65.4% (casa 58.2%) |
| Básquetbol | Philadelphia 76ers vs Cleveland Cavaliers | 56.8 / 43.2 | 59.3 / 40.7 | 2.5 | Philadelphia 76ers gana 56.8% (casa 59.3%) |
| Básquetbol | Oklahoma City Thunder vs Denver Nuggets | 60.8 / 39.2 | 70.7 / 29.3 | 9.9 | Oklahoma City Thunder gana 60.8% (casa 70.7%) |
| Básquetbol | Golden State Valkyries vs Atlanta Dream | 54.2 / 45.8 | 57.4 / 42.6 | 3.2 | Golden State Valkyries gana 54.2% (casa 57.4%) |
| Tenis | Rafael Jodar vs Casper Ruud | 51.7 / 48.3 | 53.4 / 46.6 | 1.7 | Rafael Jodar gana 51.7% (casa 53.4%) |
| Tenis | Daniil Medvedev vs Tommy Paul | 61.1 / 38.9 | 65.6 / 34.4 | 4.5 | Daniil Medvedev gana 61.1% (casa 65.6%) |
| Tenis | Alexander Zverev vs Alejandro Davidovich Fokina | 77.4 / 22.6 | 73.1 / 26.9 | 4.3 | Alexander Zverev gana 77.4% (casa 73.1%) |
| Tenis | Diana Shnaider vs Jelena Ostapenko | 64.7 / 35.3 | 66.7 / 33.3 | 2 | Diana Shnaider gana 64.7% (casa 66.7%) |
| Tenis | Elina Svitolina vs Sonay Kartal | 84.2 / 15.8 | 65.6 / 34.4 | 18.6 | Elina Svitolina gana 84.2% (casa 65.6%) |
| Tenis | Maja Chwalinska vs Maria Sakkari | 53.7 / 46.3 | 45.7 / 54.3 | 8 | Maja Chwalinska gana 53.7% (casa 45.7%) |
| Tenis | Ann Li vs Iga Swiatek | 26.4 / 73.6 | 20.8 / 79.2 | 5.6 | Iga Swiatek gana 73.6% (casa 79.2%) |
| Tenis | Leyre Romero Gormaz vs Fiona Ferro | 37.3 / 62.7 | 34.4 / 65.6 | 2.9 | Fiona Ferro gana 62.7% (casa 65.6%) |
| Tenis | Dalma Galfi vs Francesca Jones | 32.2 / 67.8 | 43.7 / 56.3 | 11.5 | Francesca Jones gana 67.8% (casa 56.3%) |
| Tenis | Jessica Bouzas Maneiro vs Polona Hercog | 69 / 31 | 75 / 25 | 6 | Jessica Bouzas Maneiro gana 69% (casa 75%) |
| Tenis | Clara Burel vs Guiomar Maristany Zuleta De Reales | 58.2 / 41.8 | 68.8 / 31.3 | 10.5 | Clara Burel gana 58.2% (casa 68.8%) |
| Tenis | Julia Grabher vs Ariana Geerlings | 64.5 / 35.5 | 60.3 / 39.7 | 4.2 | Julia Grabher gana 64.5% (casa 60.3%) |
| Tenis | Francesca Curmi vs Elizara Yaneva | 47.7 / 52.3 | 46.6 / 53.4 | 1.1 | Elizara Yaneva gana 52.3% (casa 53.4%) |
| Tenis | Andrea Lazaro Garcia vs Laura Samson | 51.4 / 48.6 | 41.5 / 58.5 | 9.9 | Andrea Lazaro Garcia gana 51.4% (casa 41.5%) |
| Tenis | Gabriela Knutson vs Martyna Kubka | 48.9 / 51.1 | 50.8 / 49.2 | 1.9 | Martyna Kubka gana 51.1% (casa 49.2%) |
| Tenis | Dominika Salkova vs Lea Boskovic | 53.7 / 46.3 | 59.4 / 40.6 | 5.7 | Dominika Salkova gana 53.7% (casa 59.4%) |
| Tenis | Lucie Havlickova vs Jil Teichmann | 52.9 / 47.1 | 58.5 / 41.5 | 5.6 | Lucie Havlickova gana 52.9% (casa 58.5%) |
| Tenis | Bianca Andreescu vs Lucrezia Stefanini | 42.7 / 57.3 | 60.3 / 39.7 | 17.6 | Lucrezia Stefanini gana 57.3% (casa 39.7%) |
