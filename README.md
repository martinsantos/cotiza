# cotizAR CLI

CLI y API para generar cotizaciones competitivas de licitaciones argentinas.

## Características

- 🔍 **Búsqueda de Licitaciones**: Busca y filtra licitaciones de licitometro.ar
- 📝 **Gestión de Cotizaciones**: Crea, analiza y calcula precios
- 📊 **Análisis de Mercado**: Precios de materiales, inflación, tipo de cambio
- ⚖️ **Cumplimiento Legal**: Marco legal argentino, cláusulas requeridas
- 📅 **Seguimiento**: Cronogramas, hitos, alertas de vencimiento
- 🎯 **Competitividad**: Análisis histórico, benchmarking, recomendaciones

## Instalación

```bash
# Clonar el repositorio
git clone <repo-url>
cd cotizar-cli

# Instalar dependencias
npm install

# Construir
npm run build
```

## Uso

### API Server

```bash
# Iniciar servidor API
npm run api

# Puerto personalizado
npm run api -- --port 8080
```

### CLI

```bash
# Ver licitaciones abiertas
npm start -- tenders list

# Buscar licitaciones
npm start -- tenders search "limpieza"

# Crear cotización
npm start -- bid create <tenderId>

# Analizar cotización
npm start -- bid analyze <bidId>

# Calcular precios
npm start -- bid calculate <bidId>

# Ver precios de mercado
npm start -- market prices

# Análisis competitivo
npm start -- competitive analyze <tenderId>

# Modo interactivo
npm start -- interactive
```

## API Endpoints

### Licitaciones

```
GET /api/tenders              # Listar licitaciones
GET /api/tenders/search?q=    # Buscar licitaciones
GET /api/tenders/:id          # Detalle de licitación
```

### Cotizaciones

```
POST /api/bids                # Crear cotización
GET /api/bids                 # Listar cotizaciones
POST /api/bids/:id/analyze    # Analizar cotización
POST /api/bids/:id/calculate   # Calcular precios
POST /api/bids/:id/documents  # Generar documentos
```

### Mercado

```
GET /api/market/materials     # Precios de materiales
GET /api/market/currencies    # Tipos de cambio
GET /api/market/inflation     # Inflación
GET /api/market/context       # Contexto económico
POST /api/market/update       # Actualizar datos
```

### Legal

```
POST /api/legal/analyze       # Analizar requisitos legales
POST /api/legal/report        # Generar reporte
```

### Seguimiento

```
GET /api/tracking/:tenderId   # Obtener seguimiento
GET /api/tracking/:tenderId/timeline  # Cronograma
GET /api/tracking/:tenderId/alerts    # Alertas
```

### Competitividad

```
POST /api/competitive/analyze  # Análisis competitivo
POST /api/competitive/price   # Recomendación de precio
```

## Interfaz Web

La interfaz web está disponible en `http://localhost:3000`

Características:
- Dashboard con estadísticas
- Gestión de licitaciones y cotizaciones
- Visualización de datos de mercado
- Configuración de empresa

## Deployment en la Nube

### Opción 1: Render.com (Gratis)

1. Crear cuenta en [render.com](https://render.com)
2. Conectar tu repositorio GitHub
3. Crear un nuevo Web Service
4. Configurar:
   - Build Command: `npm install && npm run build`
   - Start Command: `node dist/api/server.js`
   - Environment: `Node`
5. Hacer deploy

O usar el archivo `render.yaml` para deployments automáticos.

### Opción 2: Fly.io (Gratis)

```bash
# Instalar CLI
curl -L https://fly.io/install.sh | sh

# Iniciar sesión
fly auth login

# Crear app
fly apps create cotizar-api

# Deploy
fly deploy

# Ver URL
fly info
```

### Opción 3: Railway (Gratis)

1. Crear cuenta en [railway.app](https://railway.app)
2. Conectar repositorio GitHub
3. Deploy con Docker
4. Configurar variables de entorno

### Opción 4: Coolify (Auto-hospedado)

```bash
# Instalar Coolify
docker run -d --name coolify -p 8000:8000 -v /var/run/docker.sock:/var/run/docker.sock coolifyio/self-hosted
```

## Deployment Local con Docker

### Desarrollo

```bash
docker-compose up -d
```

### Producción

```bash
# Construir y ejecutar
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Con Nginx (reverso proxy)
docker-compose --profile production up -d
```

### Variables de Entorno

Crear `.env` basado en `.env.example`:

```env
API_PORT=3000
API_HOST=0.0.0.0
NODE_ENV=production
```

## Configuración

Crear `cotizar.config.json`:

```json
{
  "company": {
    "name": "Mi Empresa SA",
    "taxId": "30-12345678-9"
  },
  "defaults": {
    "currency": "ARS",
    "taxRate": 21,
    "profitMargin": 15,
    "outputDirectory": "./bids"
  },
  "api": {
    "port": 3000,
    "host": "0.0.0.0"
  }
}
```

## Estructura del Proyecto

```
cotizar-cli/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── api/
│   │   └── server.ts      # Express server
│   ├── config/
│   │   └── index.ts       # Configuración
│   ├── services/
│   │   ├── tender.service.ts
│   │   ├── bid.service.ts
│   │   ├── market.service.ts
│   │   ├── legal.service.ts
│   │   ├── tracking.service.ts
│   │   ├── competitive.service.ts
│   │   └── pattern.service.ts
│   └── types/
│       └── index.ts       # Tipos TypeScript
├── public/
│   └── index.html         # Interfaz web
├── Dockerfile
├── docker-compose.yml
└── nginx.conf
```

## Licencia

MIT
