import { Bid, CommercialOffer, BidAnalysis, RiskItem, GeneratedDocument } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { tenderService } from './tender.service.js';
import { getConfig } from '../config/index.js';
import fs from 'fs/promises';
import path from 'path';

const BIDS_DIR = process.env.BIDS_DIR || '/app/bids';

export class BidService {
  private bids: Map<string, Bid> = new Map();
  private initialized = false;

  private async ensureDir(): Promise<void> {
    await fs.mkdir(BIDS_DIR, { recursive: true });
  }

  private async saveToDisk(bid: Bid): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(path.join(BIDS_DIR, `${bid.id}.json`), JSON.stringify(bid, null, 2), 'utf-8');
  }

  private async deleteFromDisk(id: string): Promise<void> {
    try {
      await fs.unlink(path.join(BIDS_DIR, `${id}.json`));
    } catch {
      // ignore if not found
    }
  }

  private async loadFromDisk(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      await this.ensureDir();
      const files = await fs.readdir(BIDS_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(BIDS_DIR, file), 'utf-8');
          const bid = JSON.parse(raw) as Bid;
          this.bids.set(bid.id, bid);
        } catch {
          // skip corrupt files
        }
      }
    } catch {
      // ignore if dir unreadable
    }
  }

  async create(tenderId: string): Promise<Bid> {
    await this.loadFromDisk();
    const tender = await tenderService.getById(tenderId);
    if (!tender) {
      throw new Error(`Tender ${tenderId} not found`);
    }

    const config = getConfig();
    const now = new Date().toISOString();

    const bid: Bid = {
      id: `bid-${uuidv4().slice(0, 8)}`,
      tenderId,
      companyId: config.company.id,
      status: 'draft',
      technicalProposal: {
        methodology: '',
        workPlan: [],
        resources: [],
        schedule: {
          startDate: now,
          endDate: now,
          milestones: []
        },
        experience: config.company.experience || []
      },
      commercialOffer: {
        basePrice: 0,
        discount: 0,
        subtotal: 0,
        taxRate: config.defaults.taxRate,
        taxAmount: 0,
        total: 0,
        currency: config.defaults.currency,
        paymentTerms: '',
        validityDays: tender.terms?.validityOfOffer || 60
      },
      legalCompliance: {
        framework: tender.legalFramework?.law || 'Ley Nacional de Compras y Contrataciones',
        clauses: [],
        isCompliant: false
      },
      complianceMatrix: tender.requirements.map(req => ({
        requirementId: req.id,
        description: req.description,
        response: '',
        compliant: false
      })),
      documentsGenerated: [],
      createdAt: now,
      updatedAt: now
    };

    this.bids.set(bid.id, bid);
    await this.saveToDisk(bid);
    return bid;
  }

  async getById(id: string): Promise<Bid | null> {
    await this.loadFromDisk();
    return this.bids.get(id) || null;
  }

  async list(filters?: {
    tenderId?: string;
    status?: string;
    companyId?: string;
  }): Promise<Bid[]> {
    await this.loadFromDisk();
    let results = Array.from(this.bids.values());

    if (filters) {
      if (filters.tenderId) {
        results = results.filter(b => b.tenderId === filters.tenderId);
      }
      if (filters.status) {
        results = results.filter(b => b.status === filters.status);
      }
      if (filters.companyId) {
        results = results.filter(b => b.companyId === filters.companyId);
      }
    }

    return results;
  }

  async update(id: string, data: Partial<Bid>): Promise<Bid | null> {
    await this.loadFromDisk();
    const existing = this.bids.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString()
    };
    this.bids.set(id, updated);
    await this.saveToDisk(updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.loadFromDisk();
    const deleted = this.bids.delete(id);
    if (deleted) await this.deleteFromDisk(id);
    return deleted;
  }

  async calculatePricing(bidId: string, costs: {
    labor: number;
    materials: number;
    equipment: number;
    overhead: number;
    other: number;
    discount?: number;
  }): Promise<CommercialOffer> {
    const bid = await this.getById(bidId);
    if (!bid) {
      throw new Error(`Bid ${bidId} not found`);
    }

    const config = getConfig();
    const subtotal = costs.labor + costs.materials + costs.equipment + costs.overhead + costs.other;
    const discount = costs.discount || 0;
    const discountedSubtotal = subtotal * (1 - discount / 100);
    const taxAmount = discountedSubtotal * (config.defaults.taxRate / 100);
    const total = discountedSubtotal + taxAmount;

    const commercialOffer: CommercialOffer = {
      basePrice: subtotal,
      discount,
      subtotal: discountedSubtotal,
      taxRate: config.defaults.taxRate,
      taxAmount,
      total,
      currency: config.defaults.currency,
      paymentTerms: '',
      validityDays: bid.commercialOffer.validityDays
    };

    await this.update(bidId, { commercialOffer });
    return commercialOffer;
  }

  async analyze(bidId: string): Promise<BidAnalysis> {
    const bid = await this.getById(bidId);
    if (!bid) {
      throw new Error(`Bid ${bidId} not found`);
    }

    const tender = await tenderService.getById(bid.tenderId);
    if (!tender) {
      throw new Error(`Tender not found for bid ${bidId}`);
    }

    const hasPricing = bid.commercialOffer.total > 0;
    const compliantItems = hasPricing && bid.commercialOffer.total <= tender.budget;
    const hasExperience = bid.technicalProposal.experience.length > 0;
    const allCompliant = bid.complianceMatrix.length > 0 && bid.complianceMatrix.every(c => c.compliant);

    const strengths: string[] = [];
    if (compliantItems) strengths.push('Precio dentro del presupuesto');
    if (hasExperience) strengths.push('Antecedentes documentados');
    if (allCompliant) strengths.push('Cumplimiento total de requisitos');

    const weaknesses: string[] = [];
    if (!hasPricing) weaknesses.push('Sin precio calculado — usá "Calcular" primero');
    else if (!compliantItems) weaknesses.push('Precio excede el presupuesto');
    if (!hasExperience) weaknesses.push('Faltan antecedentes de la empresa');
    if (bid.complianceMatrix.length > 0 && bid.complianceMatrix.some(c => !c.compliant)) weaknesses.push('Algunos requisitos no cumplidos');

    const risks: RiskItem[] = [];
    const daysUntilClose = Math.ceil(
      (new Date(tender.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilClose < 7) {
      risks.push({
        description: 'Poco tiempo restante para presentación',
        severity: 'high',
        probability: 0.8,
        mitigation: 'Priorizar elaboración de oferta'
      });
    }

    if (bid.commercialOffer.total > tender.budget * 0.9) {
      risks.push({
        description: 'Precio muy cercano al presupuesto',
        severity: 'medium',
        probability: 0.6,
        mitigation: 'Revisar costos y buscar optimización'
      });
    }

    let winProbability = hasPricing ? 50 : 30;
    if (compliantItems) winProbability += 15;
    if (hasExperience) winProbability += 15;
    if (allCompliant) winProbability += 20;

    const analysis: BidAnalysis = {
      strengths,
      weaknesses,
      risks,
      recommendations: [
        'Completar todos los requisitos técnicos',
        'Revisar matriz de cumplimiento',
        'Verificar documentación legal'
      ],
      winProbability
    };

    await this.update(bidId, {
      analysis,
      competitivenessScore: winProbability
    });

    return analysis;
  }

  async generateDocument(bidId: string, type: 'technical' | 'commercial' | 'summary' | 'annex'): Promise<GeneratedDocument> {
    const bid = await this.getById(bidId);
    if (!bid) {
      throw new Error(`Bid ${bidId} not found`);
    }

    const tender = await tenderService.getById(bid.tenderId);
    if (!tender) {
      throw new Error(`Tender not found`);
    }

    const doc: GeneratedDocument = {
      id: `doc-${uuidv4().slice(0, 8)}`,
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} - ${tender.title}`,
      format: 'pdf',
      generatedAt: new Date().toISOString()
    };

    const updated = {
      ...bid,
      documentsGenerated: [...bid.documentsGenerated, doc],
      updatedAt: new Date().toISOString()
    };
    this.bids.set(bidId, updated);
    await this.saveToDisk(updated);

    return doc;
  }

  async duplicate(bidId: string): Promise<Bid | null> {
    const original = await this.getById(bidId);
    if (!original) return null;

    const newBid: Bid = {
      ...original,
      id: `bid-${uuidv4().slice(0, 8)}`,
      status: 'draft',
      documentsGenerated: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.bids.set(newBid.id, newBid);
    await this.saveToDisk(newBid);
    return newBid;
  }

  async updateStatus(bidId: string, status: Bid['status']): Promise<Bid | null> {
    return this.update(bidId, { status });
  }
}

export const bidService = new BidService();
