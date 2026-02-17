import { Tender, TenderRequirement, TenderDocument, TenderTerms, LegalFramework, PaymentTerms, Guarantees } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';

function rowToTender(row: any): Tender {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    description: row.description,
    agency: row.agency,
    region: row.region,
    category: row.category,
    status: row.status,
    openingDate: row.opening_date,
    closingDate: row.closing_date,
    budget: row.budget,
    currency: row.currency,
    requirements: JSON.parse(row.requirements || '[]'),
    documents: JSON.parse(row.documents || '[]'),
    terms: JSON.parse(row.terms || '{}'),
    legalFramework: row.legal_framework ? JSON.parse(row.legal_framework) : undefined,
    paymentTerms: row.payment_terms ? JSON.parse(row.payment_terms) : undefined,
    guarantees: row.guarantees ? JSON.parse(row.guarantees) : undefined,
  };
}

export class TenderService {
  constructor() {
    seedDatabase(getDb());
  }

  async search(query: string): Promise<Tender[]> {
    const db = getDb();
    const pattern = `%${query}%`;
    const rows = db.prepare(`
      SELECT * FROM tenders
      WHERE title LIKE ? COLLATE NOCASE
         OR description LIKE ? COLLATE NOCASE
         OR agency LIKE ? COLLATE NOCASE
         OR category LIKE ? COLLATE NOCASE
         OR region LIKE ? COLLATE NOCASE
    `).all(pattern, pattern, pattern, pattern, pattern);
    return rows.map(rowToTender);
  }

  async getById(id: string): Promise<Tender | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tenders WHERE id = ?').get(id);
    return row ? rowToTender(row) : null;
  }

  async list(filters?: {
    status?: string;
    category?: string;
    region?: string;
    agency?: string;
  }): Promise<Tender[]> {
    const db = getDb();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters) {
      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }
      if (filters.category) {
        conditions.push('category = ? COLLATE NOCASE');
        params.push(filters.category);
      }
      if (filters.region) {
        conditions.push('region = ? COLLATE NOCASE');
        params.push(filters.region);
      }
      if (filters.agency) {
        conditions.push('agency LIKE ? COLLATE NOCASE');
        params.push(`%${filters.agency}%`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM tenders ${whereClause}`).all(...params);
    return rows.map(rowToTender);
  }

  async create(tenderData: Partial<Tender>): Promise<Tender> {
    const db = getDb();
    const tender: Tender = {
      id: tenderData.id || `lic-${uuidv4().slice(0, 8)}`,
      number: tenderData.number || '',
      title: tenderData.title || '',
      description: tenderData.description || '',
      agency: tenderData.agency || '',
      region: tenderData.region || '',
      category: tenderData.category || 'Servicios',
      status: tenderData.status || 'abierta',
      openingDate: tenderData.openingDate || new Date().toISOString(),
      closingDate: tenderData.closingDate || new Date().toISOString(),
      budget: tenderData.budget || 0,
      currency: tenderData.currency || 'ARS',
      requirements: tenderData.requirements || [],
      documents: tenderData.documents || [],
      terms: tenderData.terms || {
        deliveryTime: '',
        placeOfDelivery: '',
        validityOfOffer: 60
      },
      legalFramework: tenderData.legalFramework,
      paymentTerms: tenderData.paymentTerms,
      guarantees: tenderData.guarantees,
    };

    db.prepare(`
      INSERT OR REPLACE INTO tenders (id, number, title, description, agency, region, category, status,
        opening_date, closing_date, budget, currency, requirements, documents, terms,
        legal_framework, payment_terms, guarantees, source, source_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      tender.id,
      tender.number,
      tender.title,
      tender.description,
      tender.agency,
      tender.region,
      tender.category,
      tender.status,
      tender.openingDate,
      tender.closingDate,
      tender.budget,
      tender.currency,
      JSON.stringify(tender.requirements),
      JSON.stringify(tender.documents),
      JSON.stringify(tender.terms),
      tender.legalFramework ? JSON.stringify(tender.legalFramework) : null,
      tender.paymentTerms ? JSON.stringify(tender.paymentTerms) : null,
      tender.guarantees ? JSON.stringify(tender.guarantees) : null,
      (tenderData as any).source || 'manual',
      (tenderData as any).sourceId || null,
    );

    return tender;
  }

  async update(id: string, data: Partial<Tender>): Promise<Tender | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updated = { ...existing, ...data };
    const db = getDb();

    db.prepare(`
      UPDATE tenders SET number = ?, title = ?, description = ?, agency = ?, region = ?,
        category = ?, status = ?, opening_date = ?, closing_date = ?, budget = ?, currency = ?,
        requirements = ?, documents = ?, terms = ?, legal_framework = ?, payment_terms = ?,
        guarantees = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      updated.number,
      updated.title,
      updated.description,
      updated.agency,
      updated.region,
      updated.category,
      updated.status,
      updated.openingDate,
      updated.closingDate,
      updated.budget,
      updated.currency,
      JSON.stringify(updated.requirements),
      JSON.stringify(updated.documents),
      JSON.stringify(updated.terms),
      updated.legalFramework ? JSON.stringify(updated.legalFramework) : null,
      updated.paymentTerms ? JSON.stringify(updated.paymentTerms) : null,
      updated.guarantees ? JSON.stringify(updated.guarantees) : null,
      id,
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.prepare('DELETE FROM tenders WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async getCategories(): Promise<string[]> {
    const db = getDb();
    const rows = db.prepare('SELECT DISTINCT category FROM tenders').all() as { category: string }[];
    return rows.map(r => r.category);
  }

  async getRegions(): Promise<string[]> {
    const db = getDb();
    const rows = db.prepare('SELECT DISTINCT region FROM tenders').all() as { region: string }[];
    return rows.map(r => r.region);
  }

  async getAgencies(): Promise<string[]> {
    const db = getDb();
    const rows = db.prepare('SELECT DISTINCT agency FROM tenders').all() as { agency: string }[];
    return rows.map(r => r.agency);
  }
}

export const tenderService = new TenderService();
