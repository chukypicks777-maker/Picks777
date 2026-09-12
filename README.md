# ⚽ DEPORTEPICKS AI VIP — Plataforma de Inteligencia Predictiva para Apuestas de Fútbol

> Plataforma web de análisis deportivo impulsada por Inteligencia Artificial de última generación (**OpenRouter / Z-AI GLM-5.2**) y modelos predictivos cuantitativos. Diseñada con una interfaz ultra-premium (estilo terminal de \$300,000 inspirada en **MasterCuota**, **Jarvis Bet** y **Picks777**).

---

## 🌟 Características Principales

### 1. ⚽ Cobertura de las 8 Ligas de Fútbol Principales
* 🇲🇽 **Liga MX** (México)
* 🇺🇸 **MLS** (EEUU Major League Soccer)
* 🇫🇷 **Ligue 1** (Francia)
* 🏴󠁧󠁢󠁥󠁮󠁧󠁿 **Premier League** (Inglaterra)
* 🇪🇸 **LaLiga EA Sports** (España)
* 🇮🇹 **Serie A TIM** (Italia)
* 🏆 **UEFA Champions League**
* 🌎 **Leagues Cup & Copas Internacionales**

---

### 2. 🤖 Motor de Inteligencia Artificial (OpenRouter GLM-5.2)
* **Modelo Principal**: `z-ai/glm-5.2:free`
* **Modelos de Respaldo Automático**: `minimax/minimax-m3:free`, `nvidia/nemotron-3.5-lightning:free`, `google/gemma-4-31b-it:free`.
* **Motor Algorítmico Cuantitativo**: Modelo de Poisson, xG (Goles Esperados) y Dixon-Coles integrado para análisis sin fallas.
* **Pronósticos Detallados**:
  * 🎯 **Marcador Exacto Predicho** (ej: `2 - 1`)
  * 💎 **Pick Principal Estrella / Banquero** con cuota y unidades recomendadas (Stake 1 a 5).
  * ⚡ **Pick de Valor (Value Bet)**.
  * 🚩 **Pronóstico Especializado de Córners (Tiros de Esquina)**.
  * 📝 **Informe Táctico Profundo en Español** con claves estadísticas.

---

### 3. ⚔️ Cara a Cara (H2H - Últimos 10 Partidos)
* Historial completo de los últimos 10 enfrentamientos directos entre ambos equipos con:
  * Fecha oficial y torneo.
  * Marcadores exactos.
  * Registro de **Ambos Anotan (BTTS)** (SÍ / NO).
  * Conteo total de **Tiros de Esquina (Corners)**.
  * Tarjetas amarillas y faltas.

---

### 4. 📊 Estadísticas y Métricas Avanzadas
* **Tiros de Esquina (Corners)**: Promedio local, promedio visita, probabilidad de líneas Over 8.5 / 9.5 / 10.5.
* **Ambos Anotan (BTTS)**: Probabilidad porcentual y rachas históricas.
* **Over / Under Goles**: Probabilidades de +1.5, +2.5, +3.5 y -2.5 goles.
* **Faltas y Tarjetas**: Promedios de disciplina y rigor arbitral.
* **Simulador Monte Carlo**: 10,000 iteraciones en tiempo real para proyectar distribución de marcadores.

---

### 5. ⚡ Creador de Parlays / Combinadas Interactivo
* Añade selecciones de cualquier partido con un solo clic (**"+ Al Parlay"**).
* **Calculadora de Cuota Total Multiplicadora** en tiempo real.
* **Conversor de Formato de Cuotas**:
  * **Decimal** (ej: `2.66`)
  * **Americano** (ej: `+166` o `-110`)
  * **Fraccionario** (ej: `83/50`)
* **Selector Multidivisa**: **USD (\$)**, **MXN (\$)**, **EUR (€)**, **COP (\$)**, **ARS (\$)**.
* Cálculo automático de **Ganancia Neta** y **Retorno Potencial** según el monto apostado.
* **Botón de 1 Clic**: *"Cargar Parlay Banquero del Día de la IA"*.
* **Compartir / Copiar Ticket**: Formato optimizado para WhatsApp y Telegram.
* ⚠️ **Advertencia Educativa**: Recordatorio claro de que si 1 evento falla, se pierde el parlay.

---

### 6. 👑 Sistema de Acceso VIP y Panel de Administración (Owner)

#### Acceso del propietario
Configura `MASTER_ADMIN_CODE` en las variables de entorno (por defecto `DeportePicks`). Al ingresar este código en la pantalla de login, el sistema inicia sesión con rol `Owner` y da acceso completo al panel de administración para generar códigos por lote, consultar activaciones y revocar accesos.

#### Funcionalidades del Panel Owner:
1. **Generador Masivo de Códigos Aleatorios**:
   * Genera de 1 a 200 códigos no repetibles en un solo clic (ej: **30 o 100 códigos**).
   * Asigna la duración deseada (**7, 15, 30, 60, 90, 365 días**).
   * Prefijo personalizado (`VIP-`, `PRO-`, etc.).
2. **Duración y Vencimiento**:
   * Los días de vigencia comienzan a descontarse **en el instante exacto en que el usuario activa el código**.
3. **Gestión y Monitoreo**:
   * Tabla con código, estado (**Disponible / Activo / Expirado**), fecha de creación, fecha de reclamo, fecha de vencimiento y días restantes.
   * Botón de **"Copiar Disponibles"** (ideal para enviar a clientes o compradores).
   * **Exportar a CSV / Excel**.
   * Opciones para **Revocar** o **Eliminar** códigos.
4. **Configuración de IA**:
   * Selector de modelo de OpenRouter en vivo.
   * Actualización de API Key.
   * Limpieza de caché de pronósticos.

---

## 🚀 Cómo Iniciar la Plataforma

### 1. Iniciar en Modo Desarrollo (Backend + Frontend)
```bash
npm run dev
```
* **Frontend Vite**: `http://localhost:5173` (con proxy automático al backend)
* **Backend Express**: `http://localhost:5000`

### 2. Iniciar Solo el Servidor Backend (Producción)
```bash
npm start
```
* Servirá automáticamente el frontend compilado y la API en `http://localhost:5000`.

### 3. Compilar para Producción
```bash
npm run build
```

---

## 🌐 Despliegue en Servidor en la Nube (100% Gratis / Escalable)

La plataforma está configurada y lista para desplegarse en cualquier nube moderna:

### Opción 1: Render.com (Recomendado — 100% Gratuito)
* **Costo**: \$0 / Mes (Incluye 750 horas de cómputo gratis mensuales).
* **Pasos**:
  1. Crea una cuenta gratuita en [render.com](https://render.com).
  2. Haz clic en **"New +"** -> **"Web Service"** -> **"Connect GitHub"**.
  3. Selecciona tu repositorio `Prugames/deportepicks-ai-vip`.
  4. Render detectará automáticamente el archivo [`render.yaml`](file:///c:/Users/rober/OneDrive/Escritorio/Proyecto%20Picks%20Apuesta/render.yaml) del proyecto.
  5. Haz clic en **"Apply"** o **"Deploy Web Service"**.
  6. ¡Listo! En 2 minutos tendrás tu enlace HTTPS público oficial: `https://deportepicks-ai-vip.onrender.com`.

### Opción 2: Railway.app (Créditos Gratis)
* **Costo**: \$5 USD de crédito mensual en prueba.
* **Pasos**:
  1. Conéctate a [railway.app](https://railway.app) con tu GitHub.
  2. Haz clic en **"New Project"** -> **"Deploy from GitHub repo"**.
  3. El archivo [`railway.json`](file:///c:/Users/rober/OneDrive/Escritorio/Proyecto%20Picks%20Apuesta/railway.json) configurará el comando de inicio `npm start`.

### Opción 3: Docker / Google Cloud Run / AWS / VPS
* El proyecto cuenta con un [`Dockerfile`](file:///c:/Users/rober/OneDrive/Escritorio/Proyecto%20Picks%20Apuesta/Dockerfile) optimizado basado en `node:22-alpine`:
```bash
docker build -t deportepicks-ai .
docker run -p 5000:5000 deportepicks-ai
```

### Opción 4: Servidor Público Instantáneo con Cloudflare
* Si deseas que tu máquina o servidor local sirva la web globalmente sin abrir puertos:
  * Ejecuta el script incluido: `iniciar-compartir-web.bat`.
  * Generará un enlace HTTPS seguro en la red de Cloudflare para compartir con usuarios de inmediato.

---

## Configuración Vercel y producción

Variables solo del servidor (nunca `VITE_*`): `MASTER_ADMIN_CODE` aleatorio de 32–128 caracteres, `SESSION_SECRET` independiente de al menos 32 caracteres, `UPSTASH_REDIS_REST_URL` HTTPS y `UPSTASH_REDIS_REST_TOKEN`. Redis es obligatorio en toda producción. OpenRouter es opcional: `OPENROUTER_API_KEY` y `OPENROUTER_MODEL`; el modelo se comprueba en el catálogo y no se sustituye por otro de pago.

Configura valores separados para Preview y Production. No compartas Redis ni credenciales productivas con pruebas. Usa HTTPS para cookies Secure. Confirma rotación de credenciales, conectividad, pruebas y aprobación del responsable antes de promover una preview. Véase `VALIDATION.md`.
