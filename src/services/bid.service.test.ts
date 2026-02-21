import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BidService } from './bid.service.js';
import type { Tender } from '../types/index.js';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('./tender.service.js', () => ({
  tenderService: {
    getById: vi.fn(),
  },
}));

vi.mock('../config/index.js', () => ({
  getConfig: () => ({
    company: { id: 'test-company', experience: [] },
    defaults: { currency: 'ARS', taxRate: 21, profitMargin: 15, outputDirectory: './bids' },
  }),
}));

// Use a temp in-memory dir so no real files are written
vi.mock('fs/promises', () => {
  const store: Record<string, string> = {};
  return {
    default: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn(async (p: string) => { if (store[p]) return store[p]; throw new Error('ENOENT'); }),
      writeFile: vi.fn(async (p: string, data: string) => { store[p] = data; }),
      unlink: vi.fn(async (p: string) => { delete store[p]; }),
    },
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTender(overrides: Partial<Tender> = {}): Tender {
  const base: Tender = {
    id: 'tender-1',
    number: 'LIC-001',
    title: 'Licitación de prueba',
    description: 'desc',
    agency: 'Ministerio Test',
    region: 'CABA',
    category: 'Servicios',
    status: 'abierta',
    openingDate: new Date(Date.now() - 86400000).toISOString(),
    closingDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    budget: 100_000,
    currency: 'ARS',
    requirements: [],
    documents: [],
    terms: { deliveryTime: '30 días', placeOfDelivery: 'CABA', validityOfOffer: 60 },
  };
  return { ...base, ...overrides };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BidService', () => {
  let service: BidService;
  let tenderService: { getById: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    // fresh instance per test (resets initialized flag & in-memory Map)
    service = new BidService();
    const mod = await import('./tender.service.js');
    tenderService = mod.tenderService as unknown as { getById: ReturnType<typeof vi.fn> };
  });

  // ── create ──────────────────────────────────────────────────────────────

  it('crea una cotización en estado draft', async () => {
    tenderService.getById.mockResolvedValue(makeTender());
    const bid = await service.create('tender-1');
    expect(bid.status).toBe('draft');
    expect(bid.tenderId).toBe('tender-1');
    expect(bid.commercialOffer.total).toBe(0);
  });

  it('lanza error si el tender no existe', async () => {
    tenderService.getById.mockResolvedValue(null);
    await expect(service.create('no-existe')).rejects.toThrow('not found');
  });

  // ── calculatePricing ────────────────────────────────────────────────────

  it('calcula precio correctamente con IVA 21% y descuento', async () => {
    tenderService.getById.mockResolvedValue(makeTender());
    const bid = await service.create('tender-1');

    const pricing = await service.calculatePricing(bid.id, {
      labor: 50_000,
      materials: 30_000,
      equipment: 0,
      overhead: 10_000,
      other: 0,
      discount: 10, // 10%
    });

    const base = 90_000;              // 50k+30k+10k
    const afterDiscount = 81_000;     // base * 0.9
    const tax = 17_010;               // 81k * 0.21
    const total = 98_010;             // afterDiscount + tax

    expect(pricing.basePrice).toBe(base);
    expect(pricing.subtotal).toBeCloseTo(afterDiscount);
    expect(pricing.taxAmount).toBeCloseTo(tax);
    expect(pricing.total).toBeCloseTo(total);
    expect(pricing.discount).toBe(10);
  });

  // ── analyze ─────────────────────────────────────────────────────────────

  it('NO muestra "Precio dentro del presupuesto" cuando total es 0', async () => {
    tenderService.getById.mockResolvedValue(makeTender({ budget: 100_000 }));
    const bid = await service.create('tender-1');
    // total sigue en 0 — sin calcular precio

    const analysis = await service.analyze(bid.id);

    expect(analysis.strengths).not.toContain('Precio dentro del presupuesto');
    expect(analysis.weaknesses.some(w => w.includes('Sin precio calculado'))).toBe(true);
    expect(analysis.winProbability).toBeLessThan(50); // base 30 sin precio
  });

  it('muestra fortaleza de precio cuando total <= presupuesto', async () => {
    tenderService.getById.mockResolvedValue(makeTender({ budget: 100_000 }));
    const bid = await service.create('tender-1');
    await service.calculatePricing(bid.id, {
      labor: 40_000, materials: 20_000, equipment: 0, overhead: 5_000, other: 0
    });
    // total ≈ 78k con IVA, dentro del presupuesto de 100k

    const analysis = await service.analyze(bid.id);
    expect(analysis.strengths).toContain('Precio dentro del presupuesto');
  });

  it('marca debilidad cuando precio excede presupuesto', async () => {
    tenderService.getById.mockResolvedValue(makeTender({ budget: 50_000 }));
    const bid = await service.create('tender-1');
    await service.calculatePricing(bid.id, {
      labor: 80_000, materials: 0, equipment: 0, overhead: 0, other: 0
    });
    // total ≈ 96.8k, supera presupuesto de 50k

    const analysis = await service.analyze(bid.id);
    expect(analysis.weaknesses.some(w => w.includes('excede'))).toBe(true);
    expect(analysis.strengths).not.toContain('Precio dentro del presupuesto');
  });

  // ── list & update ────────────────────────────────────────────────────────

  it('list devuelve cotizaciones creadas', async () => {
    tenderService.getById.mockResolvedValue(makeTender());
    await service.create('tender-1');
    await service.create('tender-1');

    const all = await service.list();
    expect(all).toHaveLength(2);
  });

  it('update modifica campos y persiste updatedAt', async () => {
    tenderService.getById.mockResolvedValue(makeTender());
    const bid = await service.create('tender-1');
    const t0 = bid.updatedAt;

    await new Promise(r => setTimeout(r, 5)); // pequeño delay
    const updated = await service.update(bid.id, { status: 'ready' });

    expect(updated?.status).toBe('ready');
    expect(updated?.updatedAt).not.toBe(t0);
  });

  it('delete elimina la cotización', async () => {
    tenderService.getById.mockResolvedValue(makeTender());
    const bid = await service.create('tender-1');

    const ok = await service.delete(bid.id);
    expect(ok).toBe(true);
    expect(await service.getById(bid.id)).toBeNull();
  });
});
