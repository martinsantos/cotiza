import { Bid, CommercialOffer, TechnicalProposal, ComplianceItem, BidAnalysis, RiskItem, GeneratedDocument, Tender } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { tenderService } from './tender.service.js';
import { getConfig } from '../config/index.js';
import { getDb } from '../db/index.js';
import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import path from 'path';

function rowToBid(row: any): Bid {
  return {
    id: row.id,
    tenderId: row.tender_id,
    companyId: row.company_id,
    status: row.status,
    technicalProposal: JSON.parse(row.technical_proposal || '{}'),
    commercialOffer: JSON.parse(row.commercial_offer || '{}'),
    legalCompliance: JSON.parse(row.legal_compliance || '{}'),
    complianceMatrix: JSON.parse(row.compliance_matrix || '[]'),
    analysis: row.analysis ? JSON.parse(row.analysis) : undefined,
    competitivenessScore: row.competitiveness_score ?? undefined,
    documentsGenerated: JSON.parse(row.documents_generated || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bidToRow(bid: Bid): any[] {
  return [
    bid.id,
    bid.tenderId,
    bid.companyId,
    bid.status,
    JSON.stringify(bid.technicalProposal),
    JSON.stringify(bid.commercialOffer),
    JSON.stringify(bid.legalCompliance),
    JSON.stringify(bid.complianceMatrix),
    bid.analysis ? JSON.stringify(bid.analysis) : null,
    bid.competitivenessScore ?? null,
    JSON.stringify(bid.documentsGenerated),
  ];
}

export class BidService {
  async create(tenderId: string): Promise<Bid> {
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

    const db = getDb();
    db.prepare(`
      INSERT INTO bids (id, tender_id, company_id, status, technical_proposal, commercial_offer,
        legal_compliance, compliance_matrix, analysis, competitiveness_score, documents_generated,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(...bidToRow(bid));

    return bid;
  }

  async getById(id: string): Promise<Bid | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM bids WHERE id = ?').get(id);
    return row ? rowToBid(row) : null;
  }

  async list(filters?: {
    tenderId?: string;
    status?: string;
    companyId?: string;
  }): Promise<Bid[]> {
    const db = getDb();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters) {
      if (filters.tenderId) {
        conditions.push('tender_id = ?');
        params.push(filters.tenderId);
      }
      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }
      if (filters.companyId) {
        conditions.push('company_id = ?');
        params.push(filters.companyId);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM bids ${whereClause}`).all(...params);
    return rows.map(rowToBid);
  }

  async update(id: string, data: Partial<Bid>): Promise<Bid | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString()
    };

    const db = getDb();
    db.prepare(`
      UPDATE bids SET tender_id = ?, company_id = ?, status = ?, technical_proposal = ?,
        commercial_offer = ?, legal_compliance = ?, compliance_matrix = ?, analysis = ?,
        competitiveness_score = ?, documents_generated = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      updated.tenderId,
      updated.companyId,
      updated.status,
      JSON.stringify(updated.technicalProposal),
      JSON.stringify(updated.commercialOffer),
      JSON.stringify(updated.legalCompliance),
      JSON.stringify(updated.complianceMatrix),
      updated.analysis ? JSON.stringify(updated.analysis) : null,
      updated.competitivenessScore ?? null,
      JSON.stringify(updated.documentsGenerated),
      id,
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.prepare('DELETE FROM bids WHERE id = ?').run(id);
    return result.changes > 0;
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

    // Analyze compliance
    const compliantItems = bid.commercialOffer.total <= tender.budget;
    const hasExperience = bid.technicalProposal.experience.length > 0;

    // Calculate strengths
    const strengths: string[] = [];
    if (compliantItems) strengths.push('Precio dentro del presupuesto');
    if (hasExperience) strengths.push('Antecedentes documentados');
    if (bid.complianceMatrix.every(c => c.compliant)) strengths.push('Cumplimiento total de requisitos');

    // Calculate weaknesses
    const weaknesses: string[] = [];
    if (!compliantItems) weaknesses.push('Precio excede el presupuesto');
    if (!hasExperience) weaknesses.push('Faltan antecedentes');
    if (bid.complianceMatrix.some(c => !c.compliant)) weaknesses.push('Algunos requisitos no cumplidos');

    // Risk assessment
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

    // Win probability calculation
    let winProbability = 50;
    if (compliantItems) winProbability += 15;
    if (hasExperience) winProbability += 15;
    if (bid.complianceMatrix.every(c => c.compliant)) winProbability += 20;

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

    const config = getConfig();
    const outputDir = config.defaults.outputDirectory || './bids';
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const filename = `${type}_${bidId}_${Date.now()}.pdf`;
    const filepath = path.join(outputDir, filename);

    await this.renderPdf(filepath, tender, bid, type, config);

    const doc: GeneratedDocument = {
      id: `doc-${uuidv4().slice(0, 8)}`,
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} - ${tender.title}`,
      format: 'pdf',
      path: filepath,
      generatedAt: new Date().toISOString()
    };

    const updatedDocs = [...bid.documentsGenerated, doc];
    await this.update(bidId, { documentsGenerated: updatedDocs });

    return doc;
  }

  private async renderPdf(
    filepath: string, tender: Tender, bid: Bid,
    type: string, config: ReturnType<typeof getConfig>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
        info: {
          Title: `${type.toUpperCase()} - ${tender.title}`,
          Author: config.company.name,
        }
      });

      const stream = createWriteStream(filepath);
      doc.pipe(stream);

      // Cover page
      doc.moveDown(6);
      doc.fontSize(10).text(config.company.name, { align: 'center' });
      doc.fontSize(10).text(`CUIT: ${config.company.taxId}`, { align: 'center' });
      doc.moveDown(3);
      doc.fontSize(22).text(this.getDocTitle(type), { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(14).text(tender.title, { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(11).text(`Licitación N° ${tender.number}`, { align: 'center' });
      doc.text(`Organismo: ${tender.agency}`, { align: 'center' });
      doc.text(`Jurisdicción: ${tender.region}`, { align: 'center' });
      doc.moveDown(2);
      doc.fontSize(10).text(`Presupuesto: $${tender.budget.toLocaleString('es-AR')} ${tender.currency}`, { align: 'center' });
      doc.text(`Fecha de apertura: ${tender.closingDate}`, { align: 'center' });
      doc.moveDown(4);
      doc.fontSize(9).text(`Documento generado el ${new Date().toLocaleDateString('es-AR')}`, { align: 'center' });

      // Content pages
      doc.addPage();

      if (type === 'technical') {
        this.renderTechnicalContent(doc, tender, bid, config);
      } else if (type === 'commercial') {
        this.renderCommercialContent(doc, tender, bid, config);
      } else if (type === 'summary') {
        this.renderSummaryContent(doc, tender, bid, config);
      } else {
        this.renderAnnexContent(doc, tender, bid);
      }

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  private getDocTitle(type: string): string {
    const titles: Record<string, string> = {
      technical: 'PROPUESTA TÉCNICA',
      commercial: 'OFERTA COMERCIAL',
      summary: 'RESUMEN EJECUTIVO',
      annex: 'ANEXOS Y CERTIFICACIONES',
    };
    return titles[type] || type.toUpperCase();
  }

  private renderTechnicalContent(doc: PDFKit.PDFDocument, tender: Tender, bid: Bid, config: ReturnType<typeof getConfig>): void {
    doc.fontSize(16).text('1. PRESENTACIÓN DE LA EMPRESA', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`${config.company.name} (CUIT: ${config.company.taxId}) presenta su propuesta técnica para la licitación "${tender.title}" convocada por ${tender.agency}.`);
    doc.moveDown(1);

    doc.fontSize(16).text('2. METODOLOGÍA DE TRABAJO', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(bid.technicalProposal.methodology || 'La metodología de trabajo se desarrollará conforme a las mejores prácticas del sector, garantizando calidad, eficiencia y cumplimiento de los plazos establecidos en el pliego de bases y condiciones.');
    doc.moveDown(1);

    doc.fontSize(16).text('3. PLAN DE TRABAJO', { underline: true });
    doc.moveDown(0.5);
    if (bid.technicalProposal.workPlan.length > 0) {
      bid.technicalProposal.workPlan.forEach((item, i) => {
        doc.fontSize(11).text(`${i + 1}. ${item.phase}: ${item.description} (${item.duration} ${item.unit})`);
      });
    } else {
      doc.fontSize(11).text('El plan de trabajo se organizará en las fases requeridas por el pliego, con hitos de seguimiento y control de calidad en cada etapa.');
    }
    doc.moveDown(1);

    doc.fontSize(16).text('4. RECURSOS', { underline: true });
    doc.moveDown(0.5);
    if (bid.technicalProposal.resources.length > 0) {
      bid.technicalProposal.resources.forEach(r => {
        doc.fontSize(11).text(`- ${r.description}: ${r.quantity} ${r.unit} (${r.type})`);
      });
    } else {
      doc.fontSize(11).text('Se asignarán los recursos humanos, materiales y equipamiento necesarios para la correcta ejecución del contrato.');
    }
    doc.moveDown(1);

    doc.fontSize(16).text('5. EXPERIENCIA', { underline: true });
    doc.moveDown(0.5);
    if (bid.technicalProposal.experience.length > 0) {
      bid.technicalProposal.experience.forEach(exp => {
        doc.fontSize(11).text(`- ${exp.projectName} (${exp.client}): $${exp.amount.toLocaleString('es-AR')} ${exp.currency} - ${exp.date}`);
        doc.fontSize(10).text(`  ${exp.description}`);
      });
    } else {
      doc.fontSize(11).text('La empresa cuenta con experiencia comprobable en proyectos de naturaleza similar.');
    }
    doc.moveDown(1);

    doc.fontSize(16).text('6. CUMPLIMIENTO DE REQUISITOS', { underline: true });
    doc.moveDown(0.5);
    bid.complianceMatrix.forEach(item => {
      const status = item.compliant ? '✓' : '○';
      doc.fontSize(11).text(`${status} ${item.description}`);
      if (item.response) doc.fontSize(10).text(`  Respuesta: ${item.response}`);
    });
  }

  private renderCommercialContent(doc: PDFKit.PDFDocument, tender: Tender, bid: Bid, config: ReturnType<typeof getConfig>): void {
    doc.fontSize(16).text('OFERTA COMERCIAL', { underline: true });
    doc.moveDown(1);

    doc.fontSize(12).text('DESGLOSE DE COSTOS');
    doc.moveDown(0.5);

    const offer = bid.commercialOffer;
    const items = [
      ['Precio base', `$${offer.basePrice.toLocaleString('es-AR')}`],
      ['Descuento', `${offer.discount}%`],
      ['Subtotal', `$${offer.subtotal.toLocaleString('es-AR')}`],
      ['IVA (${offer.taxRate}%)', `$${offer.taxAmount.toLocaleString('es-AR')}`],
      ['TOTAL', `$${offer.total.toLocaleString('es-AR')} ${offer.currency}`],
    ];

    items.forEach(([label, value]) => {
      doc.fontSize(11).text(`${label}: ${value}`);
    });

    doc.moveDown(1);
    doc.fontSize(12).text('CONDICIONES');
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Moneda: ${offer.currency}`);
    doc.text(`Validez de la oferta: ${offer.validityDays} días`);
    doc.text(`Condiciones de pago: ${offer.paymentTerms || 'Según pliego'}`);

    doc.moveDown(1);
    doc.fontSize(12).text('PRESUPUESTO OFICIAL');
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Presupuesto de la licitación: $${tender.budget.toLocaleString('es-AR')} ${tender.currency}`);
    const ratio = offer.total > 0 ? ((offer.total / tender.budget) * 100).toFixed(1) : 'N/A';
    doc.text(`Relación oferta/presupuesto: ${ratio}%`);
  }

  private renderSummaryContent(doc: PDFKit.PDFDocument, tender: Tender, bid: Bid, config: ReturnType<typeof getConfig>): void {
    doc.fontSize(16).text('RESUMEN EJECUTIVO', { underline: true });
    doc.moveDown(1);

    doc.fontSize(12).text('DATOS DE LA LICITACIÓN');
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Número: ${tender.number}`);
    doc.text(`Título: ${tender.title}`);
    doc.text(`Organismo: ${tender.agency}`);
    doc.text(`Categoría: ${tender.category}`);
    doc.text(`Presupuesto: $${tender.budget.toLocaleString('es-AR')} ${tender.currency}`);
    doc.text(`Fecha de cierre: ${tender.closingDate}`);

    doc.moveDown(1);
    doc.fontSize(12).text('DATOS DEL OFERENTE');
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Empresa: ${config.company.name}`);
    doc.text(`CUIT: ${config.company.taxId}`);

    doc.moveDown(1);
    doc.fontSize(12).text('OFERTA');
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Total ofertado: $${bid.commercialOffer.total.toLocaleString('es-AR')} ${bid.commercialOffer.currency}`);
    doc.text(`Estado: ${bid.status}`);

    if (bid.analysis) {
      doc.moveDown(1);
      doc.fontSize(12).text('ANÁLISIS');
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Probabilidad de ganar: ${bid.analysis.winProbability}%`);
      if (bid.analysis.strengths.length > 0) {
        doc.text('Fortalezas:');
        bid.analysis.strengths.forEach(s => doc.text(`  + ${s}`));
      }
      if (bid.analysis.weaknesses.length > 0) {
        doc.text('Debilidades:');
        bid.analysis.weaknesses.forEach(w => doc.text(`  - ${w}`));
      }
    }
  }

  private renderAnnexContent(doc: PDFKit.PDFDocument, tender: Tender, bid: Bid): void {
    doc.fontSize(16).text('ANEXOS Y CERTIFICACIONES', { underline: true });
    doc.moveDown(1);

    doc.fontSize(12).text('MATRIZ DE CUMPLIMIENTO DE REQUISITOS');
    doc.moveDown(0.5);
    bid.complianceMatrix.forEach((item, i) => {
      const status = item.compliant ? 'CUMPLE' : 'PENDIENTE';
      doc.fontSize(11).text(`${i + 1}. [${status}] ${item.description}`);
      if (item.response) doc.fontSize(10).text(`   ${item.response}`);
      if (item.evidence) doc.fontSize(10).text(`   Evidencia: ${item.evidence}`);
    });

    doc.moveDown(1);
    doc.fontSize(12).text('MARCO LEGAL');
    doc.moveDown(0.5);
    if (tender.legalFramework) {
      doc.fontSize(11).text(`Ley: ${tender.legalFramework.law}`);
      doc.text(`Decreto: ${tender.legalFramework.decree}`);
      doc.text(`Reglamento: ${tender.legalFramework.regulation}`);
    }

    doc.moveDown(1);
    doc.fontSize(12).text('DOCUMENTOS DE LA LICITACIÓN');
    doc.moveDown(0.5);
    if (tender.documents.length > 0) {
      tender.documents.forEach(d => {
        doc.fontSize(11).text(`- ${d.name} (${d.type})`);
      });
    } else {
      doc.fontSize(11).text('Sin documentos adjuntos.');
    }
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

    const db = getDb();
    db.prepare(`
      INSERT INTO bids (id, tender_id, company_id, status, technical_proposal, commercial_offer,
        legal_compliance, compliance_matrix, analysis, competitiveness_score, documents_generated,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(...bidToRow(newBid));

    return newBid;
  }

  async updateStatus(bidId: string, status: Bid['status']): Promise<Bid | null> {
    return this.update(bidId, { status });
  }
}

export const bidService = new BidService();
