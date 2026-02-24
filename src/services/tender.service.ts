import { Tender } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

const TENDERS_DIR = process.env.TENDERS_DIR || '/app/bids/tenders';

export class TenderService {
  private tenders: Map<string, Tender> = new Map();
  private initialized = false;
  private favorites: Set<string> = new Set();
  private favoritesLoaded = false;

  constructor() {
    // Carga lazy — primer uso dispara loadFromDisk()
  }

  // ── Persistencia en disco ────────────────────────────────────────────────

  private async ensureDir(): Promise<void> {
    await fs.mkdir(TENDERS_DIR, { recursive: true });
  }

  private async saveToDisk(tender: Tender): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(
      path.join(TENDERS_DIR, `${tender.id}.json`),
      JSON.stringify(tender, null, 2),
      'utf-8'
    );
  }

  async loadFromDisk(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      await this.ensureDir();
      const files = await fs.readdir(TENDERS_DIR);
      let loaded = 0;
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(TENDERS_DIR, file), 'utf-8');
          const tender = JSON.parse(raw) as Tender;
          this.tenders.set(tender.id, tender);
          loaded++;
        } catch { /* skip corrupt */ }
      }
      if (loaded > 0) {
        console.log(`[TenderService] ${loaded} licitaciones cargadas desde disco`);
      }
    } catch { /* ignore if dir unreadable */ }

    // Cargar muestras SOLO si no hay tenders en disco todavía
    if (this.tenders.size === 0) {
      this.loadSampleData();
    }
  }

  private loadSampleData(): void {
    const now = new Date();
    const in15d = new Date(now.getTime() + 15 * 86400000).toISOString();
    const in30d = new Date(now.getTime() + 30 * 86400000).toISOString();
    const in45d = new Date(now.getTime() + 45 * 86400000).toISOString();
    const in60d = new Date(now.getTime() + 60 * 86400000).toISOString();

    const samples: Tender[] = [
      {
        id: 'sample-001',
        number: 'EJ-001',
        title: 'Ejemplo: Servicio de Limpieza Edificios Públicos',
        description: 'Datos de ejemplo con fechas actuales. Use "Sync LICITOMETRO" para cargar licitaciones reales de licitometro.ar.',
        agency: 'Organismo Ejemplo — Mendoza',
        region: 'Mendoza',
        category: 'Servicios',
        status: 'abierta',
        openingDate: now.toISOString(),
        closingDate: in30d,
        budget: 5000000,
        currency: 'ARS',
        requirements: [
          { id: 'r1', type: 'technical', description: 'Experiencia mínima 2 años en servicios similares', mandatory: true, weight: 30 },
          { id: 'r2', type: 'legal', description: 'Inscripción AFIP vigente', mandatory: true, weight: 20 }
        ],
        documents: [],
        terms: { deliveryTime: '12 meses', placeOfDelivery: 'Mendoza Capital', validityOfOffer: 60 }
      },
      {
        id: 'sample-002',
        number: 'EJ-002',
        title: 'Ejemplo: Suministro de Equipamiento Informático',
        description: 'Datos de ejemplo con fechas actuales. Use "Sync LICITOMETRO" para cargar licitaciones reales de licitometro.ar.',
        agency: 'Ministerio Ejemplo',
        region: 'Mendoza',
        category: 'Suministros',
        status: 'abierta',
        openingDate: now.toISOString(),
        closingDate: in45d,
        budget: 15000000,
        currency: 'ARS',
        requirements: [
          { id: 'r3', type: 'technical', description: 'Equipos certificados IRAM', mandatory: true, weight: 25 },
          { id: 'r4', type: 'commercial', description: 'Precio dentro del presupuesto', mandatory: true, weight: 40 }
        ],
        documents: [],
        terms: { deliveryTime: '60 días', placeOfDelivery: 'Ministerio', validityOfOffer: 60 }
      },
      {
        id: 'sample-003',
        number: 'EJ-003',
        title: 'Ejemplo: Obra de Infraestructura Vial',
        description: 'Datos de ejemplo con fechas actuales. Use "Sync LICITOMETRO" para cargar licitaciones reales de licitometro.ar.',
        agency: 'Dirección Provincial de Vialidad',
        region: 'Mendoza',
        category: 'Obras',
        status: 'abierta',
        openingDate: now.toISOString(),
        closingDate: in60d,
        budget: 80000000,
        currency: 'ARS',
        requirements: [
          { id: 'r5', type: 'technical', description: 'Certificado categoría A constructores', mandatory: true, weight: 30 },
          { id: 'r6', type: 'legal', description: 'Seguro de riesgo de trabajo vigente', mandatory: true, weight: 15 }
        ],
        documents: [],
        terms: { deliveryTime: '18 meses', placeOfDelivery: 'Provincia de Mendoza', validityOfOffer: 90 }
      },
      {
        id: 'sample-004',
        number: 'EJ-004',
        title: 'Ejemplo: Consultoría en Gestión Ambiental',
        description: 'Datos de ejemplo con fechas actuales. Use "Sync LICITOMETRO" para cargar licitaciones reales de licitometro.ar.',
        agency: 'Secretaría de Ambiente Ejemplo',
        region: 'Buenos Aires',
        category: 'Consultoria',
        status: 'abierta',
        openingDate: now.toISOString(),
        closingDate: in15d,
        budget: 8500000,
        currency: 'ARS',
        requirements: [
          { id: 'r7', type: 'technical', description: 'Matriculación profesional vigente', mandatory: true, weight: 35 },
          { id: 'r8', type: 'legal', description: 'Seguro de responsabilidad civil', mandatory: true, weight: 20 }
        ],
        documents: [],
        terms: { deliveryTime: '6 meses', placeOfDelivery: 'Buenos Aires', validityOfOffer: 45 }
      }
    ];

    samples.forEach(t => this.tenders.set(t.id, t));
    console.log('[TenderService] Datos de muestra cargados (sin datos reales en disco)');
  }

  // ── Favoritos ────────────────────────────────────────────────────────────

  private async loadFavorites(): Promise<void> {
    if (this.favoritesLoaded) return;
    this.favoritesLoaded = true;
    try {
      await this.ensureDir();
      const raw = await fs.readFile(path.join(TENDERS_DIR, 'favorites.json'), 'utf-8');
      const ids = JSON.parse(raw) as string[];
      this.favorites = new Set(Array.isArray(ids) ? ids : []);
    } catch { /* file may not exist yet */ }
  }

  private async saveFavorites(): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(path.join(TENDERS_DIR, 'favorites.json'), JSON.stringify([...this.favorites], null, 2), 'utf-8');
  }

  async addFavorite(id: string): Promise<void> {
    await this.loadFavorites();
    this.favorites.add(id);
    await this.saveFavorites();
  }

  async removeFavorite(id: string): Promise<void> {
    await this.loadFavorites();
    this.favorites.delete(id);
    await this.saveFavorites();
  }

  async getFavoriteIds(): Promise<string[]> {
    await this.loadFavorites();
    return [...this.favorites];
  }

  async listFavorites(): Promise<Tender[]> {
    await this.loadFromDisk();
    await this.loadFavorites();
    const results = Array.from(this.tenders.values())
      .filter(t => this.favorites.has(t.id));
    results.sort((a, b) => new Date(a.closingDate).getTime() - new Date(b.closingDate).getTime());
    return results;
  }

  // ── API pública ──────────────────────────────────────────────────────────

  async search(query: string): Promise<Tender[]> {
    await this.loadFromDisk();
    const q = query.toLowerCase();
    return Array.from(this.tenders.values()).filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.agency.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.region.toLowerCase().includes(q) ||
      t.number.toLowerCase().includes(q)
    );
  }

  async getById(id: string): Promise<Tender | null> {
    await this.loadFromDisk();
    return this.tenders.get(id) || null;
  }

  // ── Auto-expirar licitaciones cuya fecha de cierre ya pasó ──────────────
  private autoExpire(): void {
    const now = new Date();
    for (const [id, tender] of this.tenders.entries()) {
      if (tender.status === 'abierta' && new Date(tender.closingDate) < now) {
        const updated = { ...tender, status: 'cerrada' as const };
        this.tenders.set(id, updated);
        if (!id.startsWith('sample-')) {
          this.saveToDisk(updated).catch(() => {});
        }
      }
    }
  }

  async list(filters?: {
    status?: string;
    category?: string;
    region?: string;
    agency?: string;
  }): Promise<Tender[]> {
    await this.loadFromDisk();
    this.autoExpire();
    let results = Array.from(this.tenders.values());

    if (filters) {
      if (filters.status) results = results.filter(t => t.status === filters.status);
      if (filters.category) results = results.filter(t => t.category.toLowerCase() === filters.category!.toLowerCase());
      if (filters.region) results = results.filter(t => t.region.toLowerCase() === filters.region!.toLowerCase());
      if (filters.agency) results = results.filter(t => t.agency.toLowerCase().includes(filters.agency!.toLowerCase()));
    }

    // Más próximas a vencer primero (abiertas al frente, luego por fecha)
    results.sort((a, b) => {
      if (a.status === 'abierta' && b.status !== 'abierta') return -1;
      if (a.status !== 'abierta' && b.status === 'abierta') return 1;
      return new Date(a.closingDate).getTime() - new Date(b.closingDate).getTime();
    });
    return results;
  }

  async create(tenderData: Partial<Tender>): Promise<Tender> {
    await this.loadFromDisk();
    const tender: Tender = {
      id: tenderData.id || `lic-${uuidv4().slice(0, 8)}`,
      number: tenderData.number || '',
      title: tenderData.title || '',
      description: tenderData.description || '',
      agency: tenderData.agency || '',
      region: tenderData.region || '',
      category: tenderData.category || 'General',
      status: tenderData.status || 'abierta',
      openingDate: tenderData.openingDate || new Date().toISOString(),
      closingDate: tenderData.closingDate || new Date().toISOString(),
      budget: tenderData.budget || 0,
      currency: tenderData.currency || 'ARS',
      requirements: tenderData.requirements || [],
      documents: tenderData.documents || [],
      terms: tenderData.terms || { deliveryTime: '', placeOfDelivery: '', validityOfOffer: 60 }
    };

    this.tenders.set(tender.id, tender);
    if (!tender.id.startsWith('sample-')) {
      await this.saveToDisk(tender).catch(() => {});
    }
    return tender;
  }

  async update(id: string, data: Partial<Tender>): Promise<Tender | null> {
    await this.loadFromDisk();
    const existing = this.tenders.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    this.tenders.set(id, updated);
    if (!id.startsWith('sample-')) {
      await this.saveToDisk(updated).catch(() => {});
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.loadFromDisk();
    const existed = this.tenders.delete(id);
    if (existed && !id.startsWith('sample-')) {
      fs.unlink(path.join(TENDERS_DIR, `${id}.json`)).catch(() => {});
    }
    return existed;
  }

  async getCategories(): Promise<string[]> {
    await this.loadFromDisk();
    const cats = new Set<string>();
    this.tenders.forEach(t => cats.add(t.category));
    return Array.from(cats).sort();
  }

  async getRegions(): Promise<string[]> {
    await this.loadFromDisk();
    const regions = new Set<string>();
    this.tenders.forEach(t => regions.add(t.region));
    return Array.from(regions).sort();
  }

  async getAgencies(): Promise<string[]> {
    await this.loadFromDisk();
    const agencies = new Set<string>();
    this.tenders.forEach(t => agencies.add(t.agency));
    return Array.from(agencies).sort();
  }

  async count(): Promise<{ total: number; sample: number; real: number }> {
    await this.loadFromDisk();
    const ids = Array.from(this.tenders.keys());
    const sample = ids.filter(id => id.startsWith('sample-')).length;
    return { total: ids.length, sample, real: ids.length - sample };
  }
}

export const tenderService = new TenderService();
