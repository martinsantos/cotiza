import { describe, it, expect } from 'vitest';
import { tenderService } from '../services/tender.service.js';
import { bidService } from '../services/bid.service.js';
import { patternService } from '../services/pattern.service.js';
import { marketService } from '../services/market.service.js';

describe('TenderService', () => {
  it('should list all tenders', async () => {
    const tenders = await tenderService.list();
    expect(tenders).toBeInstanceOf(Array);
    expect(tenders.length).toBeGreaterThan(0);
  });

  it('should get tender by id', async () => {
    const tender = await tenderService.getById('lic-001');
    expect(tender).not.toBeNull();
    expect(tender!.id).toBe('lic-001');
    expect(tender!.title).toContain('Limpieza');
  });

  it('should return null for non-existent tender', async () => {
    const tender = await tenderService.getById('non-existent');
    expect(tender).toBeNull();
  });

  it('should search tenders by query', async () => {
    const results = await tenderService.search('limpieza');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title.toLowerCase()).toContain('limpieza');
  });

  it('should filter tenders by status', async () => {
    const open = await tenderService.list({ status: 'abierta' });
    open.forEach(t => expect(t.status).toBe('abierta'));
  });

  it('should filter tenders by category', async () => {
    const services = await tenderService.list({ category: 'Servicios' });
    services.forEach(t => expect(t.category).toBe('Servicios'));
  });

  it('should return categories', async () => {
    const categories = await tenderService.getCategories();
    expect(categories).toContain('Servicios');
    expect(categories).toContain('Obras');
  });

  it('should return regions', async () => {
    const regions = await tenderService.getRegions();
    expect(regions).toContain('CABA');
  });
});

describe('BidService', () => {
  it('should create a bid for a tender', async () => {
    const bid = await bidService.create('lic-001');
    expect(bid).toBeDefined();
    expect(bid.tenderId).toBe('lic-001');
    expect(bid.status).toBe('draft');
    expect(bid.id).toBeTruthy();
  });

  it('should list all bids', async () => {
    await bidService.create('lic-002');
    const bids = await bidService.list();
    expect(bids.length).toBeGreaterThanOrEqual(1);
  });

  it('should analyze a bid', async () => {
    const bid = await bidService.create('lic-001');
    const analysis = await bidService.analyze(bid.id);
    expect(analysis).toBeDefined();
    expect(analysis.winProbability).toBeGreaterThanOrEqual(0);
    expect(analysis.strengths).toBeInstanceOf(Array);
    expect(analysis.weaknesses).toBeInstanceOf(Array);
  });

  it('should calculate pricing for a bid', async () => {
    const bid = await bidService.create('lic-001');
    const pricing = await bidService.calculatePricing(bid.id, {
      labor: 1000000,
      materials: 500000,
      equipment: 200000,
      overhead: 100000,
      other: 50000,
      discount: 5,
    });
    expect(pricing).toBeDefined();
    expect(pricing.total).toBeGreaterThan(0);
    expect(pricing.basePrice).toBeGreaterThan(0);
  });
});

describe('PatternService', () => {
  it('should list patterns', async () => {
    const patterns = await patternService.list();
    expect(patterns).toBeInstanceOf(Array);
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('should search patterns', async () => {
    const results = await patternService.search('limpieza');
    expect(results).toBeInstanceOf(Array);
  });
});

describe('MarketService', () => {
  it('should return material prices', async () => {
    const prices = await marketService.getMaterialPrices();
    expect(prices).toBeInstanceOf(Array);
    expect(prices.length).toBeGreaterThan(0);
    expect(prices[0].name).toBeTruthy();
    expect(prices[0].currentPrice).toBeGreaterThan(0);
  });

  it('should return currencies', async () => {
    const currencies = await marketService.getCurrencies();
    expect(currencies).toBeInstanceOf(Array);
    expect(currencies.length).toBeGreaterThan(0);
  });

  it('should return inflation data', async () => {
    const inflation = await marketService.getInflation();
    expect(inflation).not.toBeNull();
    expect(inflation!.monthly).toBeGreaterThan(0);
  });

  it('should return economic context', async () => {
    const context = await marketService.getEconomicContext();
    expect(context).toBeDefined();
    expect(context.summary).toBeTruthy();
  });
});
