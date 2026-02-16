import express, { Request, Response } from 'express';
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
import { getConfig } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from public directory
const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ TENDERS ============

// List tenders
app.get('/api/tenders', async (req: Request, res: Response) => {
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
app.get('/api/tenders/search', async (req: Request, res: Response) => {
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

// Get tender by ID
app.get('/api/tenders/:id', async (req: Request, res: Response) => {
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

// Get tender categories
app.get('/api/tenders/meta/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await tenderService.getCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// Get tender regions
app.get('/api/tenders/meta/regions', async (_req: Request, res: Response) => {
  try {
    const regions = await tenderService.getRegions();
    res.json(regions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get regions' });
  }
});

// ============ BIDS ============

// List bids
app.get('/api/bids', async (req: Request, res: Response) => {
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
app.get('/api/bids/:id', async (req: Request, res: Response) => {
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
app.post('/api/bids', async (req: Request, res: Response) => {
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
app.post('/api/bids/:id/analyze', async (req: Request, res: Response) => {
  try {
    const analysis = await bidService.analyze(req.params.id);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze bid' });
  }
});

// Calculate pricing
app.post('/api/bids/:id/calculate', async (req: Request, res: Response) => {
  try {
    const costs = req.body;
    const pricing = await bidService.calculatePricing(req.params.id, costs);
    res.json(pricing);
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate pricing' });
  }
});

// Generate document
app.post('/api/bids/:id/documents', async (req: Request, res: Response) => {
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
app.get('/api/patterns/search', async (req: Request, res: Response) => {
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
app.get('/api/patterns', async (_req: Request, res: Response) => {
  try {
    const patterns = await patternService.list();
    res.json(patterns);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list patterns' });
  }
});

// ============ MARKET ============

// Get material prices
app.get('/api/market/materials', async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const prices = await marketService.getMaterialPrices(category as string);
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get materials' });
  }
});

// Get currencies
app.get('/api/market/currencies', async (_req: Request, res: Response) => {
  try {
    const currencies = await marketService.getCurrencies();
    res.json(currencies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get currencies' });
  }
});

// Get inflation
app.get('/api/market/inflation', async (_req: Request, res: Response) => {
  try {
    const inflation = await marketService.getInflation();
    res.json(inflation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get inflation' });
  }
});

// Get economic context
app.get('/api/market/context', async (_req: Request, res: Response) => {
  try {
    const context = await marketService.getEconomicContext();
    res.json(context);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get context' });
  }
});

// Update market data
app.post('/api/market/update', async (_req: Request, res: Response) => {
  try {
    const result = await marketService.updateMarketData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update market data' });
  }
});

// ============ LEGAL ============

// Analyze legal requirements
app.post('/api/legal/analyze', async (req: Request, res: Response) => {
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
app.post('/api/legal/report', async (req: Request, res: Response) => {
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
app.get('/api/tracking/:tenderId', async (req: Request, res: Response) => {
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
app.get('/api/tracking/:tenderId/timeline', async (req: Request, res: Response) => {
  try {
    const timeline = await trackingService.getTimeline(req.params.tenderId);
    res.json(timeline);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get timeline' });
  }
});

// Get alerts
app.get('/api/tracking/:tenderId/alerts', async (req: Request, res: Response) => {
  try {
    const alerts = await trackingService.getAlerts(req.params.tenderId);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// ============ COMPETITIVE ============

// Analyze competitiveness
app.post('/api/competitive/analyze', async (req: Request, res: Response) => {
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
app.post('/api/competitive/price', async (req: Request, res: Response) => {
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

// Get competitor analysis
app.get('/api/competitive/competitors/:region', async (req: Request, res: Response) => {
  try {
    const analysis = await competitiveService.getCompetitorAnalysis(req.params.region);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get competitor analysis' });
  }
});

// ============ LICITOMETRO ============

// Search licitometro.ar
app.get('/api/licitometro/search', async (req: Request, res: Response) => {
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
app.post('/api/licitometro/sync', async (req: Request, res: Response) => {
  try {
    const params = req.body;
    const result = await licitometroService.sync(params);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync from licitometro' });
  }
});

// Get licitometro status
app.get('/api/licitometro/status', (_req: Request, res: Response) => {
  try {
    const status = licitometroService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get licitometro status' });
  }
});

// Get jurisdicciones
app.get('/api/licitometro/jurisdicciones', async (_req: Request, res: Response) => {
  try {
    const jurisdicciones = await licitometroService.getJurisdicciones();
    res.json(jurisdicciones);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get jurisdicciones' });
  }
});

// Get rubros
app.get('/api/licitometro/rubros', async (_req: Request, res: Response) => {
  try {
    const rubros = await licitometroService.getRubros();
    res.json(rubros);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get rubros' });
  }
});

// ============ CONFIG ============

// Get config
app.get('/api/config', (_req: Request, res: Response) => {
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

// Serve index.html for all other routes (SPA support)
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

export function startServer(port: number = 3000): void {
  const config = getConfig();
  const actualPort = port || config.api.port;
  
  app.listen(actualPort, config.api.host, () => {
    console.log(`cotizAR API server running on http://${config.api.host}:${actualPort}`);
    console.log(`Web UI available at http://localhost:${actualPort}`);
  });
}

export default app;
