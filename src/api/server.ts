import express, { Request, Response, Router } from 'express';
import cors from 'cors';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { tenderService } from '../services/tender.service.js';
import { bidService } from '../services/bid.service.js';
import { patternService } from '../services/pattern.service.js';
import { marketService } from '../services/market.service.js';
import { legalService } from '../services/legal.service.js';
import { trackingService } from '../services/tracking.service.js';
import { competitiveService } from '../services/competitive.service.js';
import { licitometroService } from '../services/licitometro.service.js';
import { getConfig, loadConfig } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// BASE_PATH support for sub-path deployments (e.g. /cotizar)
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');

const publicPath = path.join(process.cwd(), 'public');

// Create a router with all app routes
const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Read index.html on every request so frontend changes are reflected without restart
import { readFileSync } from 'fs';
function getIndexHtml(): string {
  const html = readFileSync(path.join(publicPath, 'index.html'), 'utf-8');
  return html.replace(
    '<!-- __BASE_PATH__ -->',
    `<script>window.__BASE_PATH__ = ${JSON.stringify(BASE_PATH)};</script>`
  );
}

router.get('/', (_req: Request, res: Response) => {
  res.type('html').send(getIndexHtml());
});

// Serve static files
router.use(express.static(publicPath));

// ============ TENDERS ============

// List tenders
router.get('/api/tenders', async (req: Request, res: Response) => {
  try {
    const { status, category, region, agency } = req.query;
    const tenders = await tenderService.list({
      status: status as string,
      category: category as string,
      region: region as string,
      agency: agency as string
    });
    res.json(tenders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list tenders' });
  }
});

// Search tenders
router.get('/api/tenders/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    const tenders = await tenderService.search(q as string);
    res.json(tenders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search tenders' });
  }
});

// Tender count (real vs sample)
router.get('/api/tenders/meta/count', async (_req: Request, res: Response) => {
  try {
    const count = await tenderService.count();
    res.json(count);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get count' });
  }
});

// Get tender categories (MUST be before :id route)
router.get('/api/tenders/meta/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await tenderService.getCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// Get tender regions (MUST be before :id route)
router.get('/api/tenders/meta/regions', async (_req: Request, res: Response) => {
  try {
    const regions = await tenderService.getRegions();
    res.json(regions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get regions' });
  }
});

// Get tender by ID (after all specific /api/tenders/* routes)
router.get('/api/tenders/:id', async (req: Request, res: Response) => {
  try {
    const tender = await tenderService.getById(req.params.id);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }
    res.json(tender);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tender' });
  }
});

// ============ BIDS ============

// List bids
router.get('/api/bids', async (req: Request, res: Response) => {
  try {
    const { tenderId, status, companyId } = req.query;
    const bids = await bidService.list({
      tenderId: tenderId as string,
      status: status as string,
      companyId: companyId as string
    });
    res.json(bids);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list bids' });
  }
});

// Get bid by ID
router.get('/api/bids/:id', async (req: Request, res: Response) => {
  try {
    const bid = await bidService.getById(req.params.id);
    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }
    res.json(bid);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get bid' });
  }
});

// Create bid
router.post('/api/bids', async (req: Request, res: Response) => {
  try {
    const { tenderId } = req.body;
    if (!tenderId) {
      return res.status(400).json({ error: 'tenderId required' });
    }
    const bid = await bidService.create(tenderId);
    res.status(201).json(bid);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create bid' });
  }
});

// Analyze bid
router.post('/api/bids/:id/analyze', async (req: Request, res: Response) => {
  try {
    const analysis = await bidService.analyze(req.params.id);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze bid' });
  }
});

// Calculate pricing
router.post('/api/bids/:id/calculate', async (req: Request, res: Response) => {
  try {
    const costs = req.body;
    const pricing = await bidService.calculatePricing(req.params.id, costs);
    res.json(pricing);
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate pricing' });
  }
});

// Generate document
router.post('/api/bids/:id/documents', async (req: Request, res: Response) => {
  try {
    const { type } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'Document type required' });
    }
    const doc = await bidService.generateDocument(req.params.id, type);
    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

// ============ PATTERNS ============

// Search patterns
router.get('/api/patterns/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    const patterns = await patternService.search(q as string);
    res.json(patterns);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search patterns' });
  }
});

// List patterns
router.get('/api/patterns', async (_req: Request, res: Response) => {
  try {
    const patterns = await patternService.list();
    res.json(patterns);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list patterns' });
  }
});

// ============ MARKET ============

// Get material prices
router.get('/api/market/materials', async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const prices = await marketService.getMaterialPrices(category as string);
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get materials' });
  }
});

// Get currencies
router.get('/api/market/currencies', async (_req: Request, res: Response) => {
  try {
    const currencies = await marketService.getCurrencies();
    res.json(currencies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get currencies' });
  }
});

// Get inflation
router.get('/api/market/inflation', async (_req: Request, res: Response) => {
  try {
    const inflation = await marketService.getInflation();
    res.json(inflation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get inflation' });
  }
});

// Get economic context
router.get('/api/market/context', async (_req: Request, res: Response) => {
  try {
    const context = await marketService.getEconomicContext();
    res.json(context);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get context' });
  }
});

// Update market data
router.post('/api/market/update', async (_req: Request, res: Response) => {
  try {
    const result = await marketService.updateMarketData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update market data' });
  }
});

// ============ LEGAL ============

// Analyze legal requirements
router.post('/api/legal/analyze', async (req: Request, res: Response) => {
  try {
    const { tenderId } = req.body;
    const tender = await tenderService.getById(tenderId);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }
    const analysis = await legalService.analyzeLegalRequirements(tender);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze legal requirements' });
  }
});

// Generate compliance report
router.post('/api/legal/report', async (req: Request, res: Response) => {
  try {
    const { tenderId } = req.body;
    const tender = await tenderService.getById(tenderId);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }
    const report = await legalService.generateComplianceReport(tender);
    res.json({ report });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============ TRACKING ============

// Get tracking for tender
router.get('/api/tracking/:tenderId', async (req: Request, res: Response) => {
  try {
    const tracking = await trackingService.getTracking(req.params.tenderId);
    if (!tracking) {
      // Create tracking if not exists
      const tender = await tenderService.getById(req.params.tenderId);
      if (!tender) {
        return res.status(404).json({ error: 'Tender not found' });
      }
      const newTracking = await trackingService.createTracking(tender);
      return res.json(newTracking);
    }
    res.json(tracking);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tracking' });
  }
});

// Get timeline
router.get('/api/tracking/:tenderId/timeline', async (req: Request, res: Response) => {
  try {
    const timeline = await trackingService.getTimeline(req.params.tenderId);
    res.json(timeline);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get timeline' });
  }
});

// Get alerts
router.get('/api/tracking/:tenderId/alerts', async (req: Request, res: Response) => {
  try {
    const alerts = await trackingService.getAlerts(req.params.tenderId);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// ============ COMPETITIVE ============

// Analyze competitiveness
router.post('/api/competitive/analyze', async (req: Request, res: Response) => {
  try {
    const { tenderId } = req.body;
    const tender = await tenderService.getById(tenderId);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }
    const analysis = await competitiveService.analyze(tender);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze competitiveness' });
  }
});

// Get price recommendation
router.post('/api/competitive/price', async (req: Request, res: Response) => {
  try {
    const { tenderId, margin } = req.body;
    const tender = await tenderService.getById(tenderId);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }
    const historical = await competitiveService.analyze(tender);
    const recommendation = await competitiveService.getPriceRecommendation(
      tender,
      historical.benchmark,
      margin
    );
    res.json(recommendation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get price recommendation' });
  }
});

// Search historical equivalent tenders (expired/awarded/failed) for competition analysis
router.get('/api/competitive/historico', async (req: Request, res: Response) => {
  try {
    const { tenderId } = req.query;
    if (!tenderId) {
      return res.status(400).json({ error: 'tenderId required' });
    }
    const tender = await tenderService.getById(tenderId as string);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }
    // Obtener la inflación anual del servicio de mercado para ajuste de precios
    let annualInflation = 2.1; // fallback: 210% anual (Argentina promedio)
    try {
      const inflation = await marketService.getInflation();
      if (inflation && typeof inflation.annual === 'number' && inflation.annual > 0) {
        annualInflation = inflation.annual / 100;
      }
    } catch { /* usar fallback */ }

    const equivalents = await licitometroService.searchHistoricalEquivalents(tender, annualInflation);
    res.json({ equivalents, inflationRate: Math.round(annualInflation * 100) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to search historical equivalents' });
  }
});

// Get competitor analysis
router.get('/api/competitive/competitors/:region', async (req: Request, res: Response) => {
  try {
    const analysis = await competitiveService.getCompetitorAnalysis(req.params.region);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get competitor analysis' });
  }
});

// ============ LICITOMETRO ============

// Search licitometro.ar
router.get('/api/licitometro/search', async (req: Request, res: Response) => {
  try {
    const { q, estado, jurisdiccion, rubro, organismo, fecha_desde, fecha_hasta, monto_min, monto_max, page, limit } = req.query;
    const result = await licitometroService.search({
      q: q as string,
      estado: estado as string,
      jurisdiccion: jurisdiccion as string,
      rubro: rubro as string,
      organismo: organismo as string,
      fecha_desde: fecha_desde as string,
      fecha_hasta: fecha_hasta as string,
      monto_min: monto_min ? Number(monto_min) : undefined,
      monto_max: monto_max ? Number(monto_max) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search licitometro' });
  }
});

// Sync from licitometro.ar
router.post('/api/licitometro/sync', async (req: Request, res: Response) => {
  try {
    const params = req.body;
    const result = await licitometroService.sync(params);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync from licitometro' });
  }
});

// Get licitometro status
router.get('/api/licitometro/status', (_req: Request, res: Response) => {
  try {
    const status = licitometroService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get licitometro status' });
  }
});

// ============ SCRAPERS ============

// Get scraper health from licitometro.ar backend
router.get('/api/scrapers/health', async (_req: Request, res: Response) => {
  try {
    const health = await licitometroService.getScraperHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get scraper health' });
  }
});

// Get scraper configurations
router.get('/api/scrapers/configs', async (_req: Request, res: Response) => {
  try {
    const configs = await licitometroService.getScraperConfigs();
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get scraper configs' });
  }
});

// Get favorites from LICITOMETRO.AR (requires LICITOMETRO_API_KEY)
router.get('/api/licitometro/favorites', async (_req: Request, res: Response) => {
  try {
    const result = await licitometroService.getFavorites();
    if (result.error) {
      // Devuelve igualmente, pero con el mensaje de error para que el frontend lo muestre
      return res.json({ tenders: result.tenders, error: result.error });
    }
    res.json({ tenders: result.tenders });
  } catch (error) {
    res.status(500).json({ tenders: [], error: 'Error obteniendo favoritos' });
  }
});

// Get jurisdicciones
router.get('/api/licitometro/jurisdicciones', async (_req: Request, res: Response) => {
  try {
    const jurisdicciones = await licitometroService.getJurisdicciones();
    res.json(jurisdicciones);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get jurisdicciones' });
  }
});

// Get rubros
router.get('/api/licitometro/rubros', async (_req: Request, res: Response) => {
  try {
    const rubros = await licitometroService.getRubros();
    res.json(rubros);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get rubros' });
  }
});

// ============ CONFIG ============

// Get config
router.get('/api/config', (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    // Remove sensitive data
    const safeConfig = {
      company: {
        name: config.company.name,
        taxId: config.company.taxId
      },
      defaults: config.defaults
    };
    res.json(safeConfig);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// SPA fallback: serve index.html for unknown routes
router.get('*', (_req: Request, res: Response) => {
  res.type('html').send(getIndexHtml());
});

// Mount router at BASE_PATH when set (handles proxy that preserves the prefix)
// AND always at root (handles proxy that strips the prefix, e.g. nginx proxy_pass with trailing slash)
// This way the app works regardless of how the upstream proxy is configured.
if (BASE_PATH) {
  app.use(BASE_PATH, router);
}
app.use('/', router);

export function startServer(port?: number): void {
  const config = getConfig();
  const actualPort = port || Number(process.env.PORT) || config.api.port || 3000;
  const host = process.env.API_HOST || config.api.host || '0.0.0.0';

  app.listen(actualPort, host, () => {
    const base = BASE_PATH || '';
    console.log(`cotizAR API server running on http://${host}:${actualPort}${base}`);
    console.log(`Web UI available at http://localhost:${actualPort}${base}/`);
    if (BASE_PATH) {
      console.log(`BASE_PATH: ${BASE_PATH}`);
    }

    // Auto-sync al arrancar (no bloquea el servidor)
    const runSync = (label: string) => {
      licitometroService.sync({ estado: 'abierta', limit: 100 })
        .then(result => console.log(`[${label}] Sync: ${result.message}`))
        .catch(err => console.warn(`[${label}] Sync falló:`, err?.message));
    };

    setTimeout(() => runSync('startup'), 3000);

    // Re-sync automático cada hora para mantener datos frescos
    const SYNC_INTERVAL_MS = 60 * 60 * 1000;
    setInterval(() => runSync('auto-sync'), SYNC_INTERVAL_MS);
  });
}

// Auto-start when run directly (not imported as module)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('/api/server.js') ||
  process.argv[1].endsWith('/api/server.ts')
);

if (isMainModule) {
  loadConfig();
  startServer();
}

export default app;
