import { Tender, LegalFramework, LegalClause, LegalConfig } from '../types/index.js';
import { getConfig } from '../config/index.js';

interface LegalClauseTemplate {
  type: string;
  description: string;
  template: string;
}

const clauseTemplates: Record<string, LegalClauseTemplate> = {
  confidentiality: {
    type: 'confidentiality',
    description: 'Confidentiality Clause',
    template: 'El contratante se compromete a mantener estricta confidencialidad sobre toda la información proporcionada por el contratista en el marco del presente contrato.'
  },
  warranty: {
    type: 'warranty',
    description: 'Warranty Clause',
    template: 'El contratista garantiza que los servicios prestados se ajustan a las especificaciones técnicas y calidad pactadas por un período de {{warranty_months}} meses.'
  },
  penalty: {
    type: 'penalty',
    description: 'Penalty Clause',
    template: 'En caso de incumplimiento de los plazos establecidos, se aplicarán penalizaciones equivalentes al {{penalty_rate}}% del valor del contrato por cada día de atraso.'
  },
  termination: {
    type: 'termination',
    description: 'Termination Clause',
    template: 'Cualquiera de las partes podrá rescindir el contrato con un preaviso de {{notice_days}} días, sin derecho a indemnización.'
  },
  force_majeure: {
    type: 'force_majeure',
    description: 'Force Majeure Clause',
    template: 'Ninguna de las partes será responsable por fuerza mayor conforme al artículo 1730 del Código Civil y Comercial.'
  },
  payment: {
    type: 'payment',
    description: 'Payment Terms Clause',
    template: 'Los pagos se realizarán según el cronograma establecido, dentro de los {{payment_days}} días de presentada la factura.'
  },
  insurance: {
    type: 'insurance',
    description: 'Insurance Clause',
    template: 'El contratista deberá mantener vigente un seguro de riesgo de trabajo y responsabilidad civil por la totalidad del período contractual.'
  },
  subcontracting: {
    type: 'subcontracting',
    description: 'Subcontracting Clause',
    template: 'Queda prohibida la subcontratación total o parcial de los servicios sin autorización previa y escrita del comitente.'
  }
};

export class LegalService {
  async analyzeLegalRequirements(tender: Tender, legalCfg?: Partial<LegalConfig>): Promise<{
    framework: LegalFramework;
    requiredClauses: LegalClause[];
    complianceChecklist: string[];
    recommendations: string[];
    clauseVariables: Record<string, string>;
  }> {
    const cfg: LegalConfig = { ...getConfig().legal, ...(legalCfg || {}) };
    const serviceType = this.detectServiceType(tender);
    const framework = this.getFramework(serviceType, tender.legalFramework);

    const clauseVars: Record<string, string> = {
      warranty_months: String(cfg.warrantyMonths),
      penalty_rate: String(cfg.penaltyRatePercent),
      notice_days: String(cfg.noticeDays),
      payment_days: String(cfg.paymentDays),
    };

    const requiredClauseKeys = this.getRequiredClauses(serviceType);
    const requiredClauses = await Promise.all(
      requiredClauseKeys.map(key => this.getClauseTemplate(key, clauseVars))
    ).then(clauses => clauses.filter(Boolean) as LegalClause[]);

    const complianceChecklist = this.generateComplianceChecklist(tender, cfg);
    const recommendations = this.getLegalRecommendations(serviceType, tender, cfg);

    return {
      framework,
      requiredClauses,
      complianceChecklist,
      recommendations,
      clauseVariables: clauseVars
    };
  }

  private detectServiceType(tender: Tender): string {
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const text = `${normalize(tender.category)} ${normalize(tender.title)}`;

    if (/obra|construccion|refaccion|edilicio|civil|vial|hidraulic/.test(text)) {
      return 'obra_publica';
    }
    if (/servicio|limpieza|mantenimiento|vigilancia|seguridad|catering|transporte|logistic/.test(text)) {
      return 'servicio';
    }
    if (/suministro|compra|adquisicion|provision|insumo|alimento|medicamento|equipamiento|tecnologia|informatica|software|hardware/.test(text)) {
      return 'suministro';
    }
    if (/consultoria|asesoria|estudio|auditoria|relevamiento|capacitacion|educacion/.test(text)) {
      return 'servicio';
    }
    if (/salud|medic|hospital|sanitari|farmac/.test(text)) {
      return 'suministro';
    }
    return 'general';
  }

  private getFramework(serviceType: string, existing?: LegalFramework): LegalFramework {
    const frameworks: Record<string, LegalFramework> = {
      obra_publica: {
        law: 'Ley de Obras Públicas',
        decree: 'Decreto 691/2016',
        regulation: 'Régimen de Contrataciones de Obras Públicas'
      },
      servicio: {
        law: 'Ley Nacional de Compras y Contrataciones',
        decree: 'Decreto 1023/2001',
        regulation: 'Régimen de Contrataciones de la Administración Pública Nacional'
      },
      suministro: {
        law: 'Ley de Compras Electrónicas',
        decree: 'Decreto 1149/2007',
        regulation: 'Sistema Electrónico de Contrataciones'
      },
      general: {
        law: 'Ley Nacional de Compras y Contrataciones',
        decree: 'Decreto 1023/2001',
        regulation: 'Régimen General de Contrataciones'
      }
    };

    return existing || frameworks[serviceType] || frameworks.general;
  }

  private getRequiredClauses(serviceType: string): string[] {
    const baseClauses = ['confidentiality', 'force_majeure', 'termination', 'payment'];

    const typeSpecificClauses: Record<string, string[]> = {
      obra_publica: [...baseClauses, 'warranty', 'penalty', 'insurance', 'subcontracting'],
      servicio: [...baseClauses, 'warranty', 'penalty', 'insurance', 'subcontracting'],
      suministro: [...baseClauses, 'warranty', 'insurance'],
      general: baseClauses
    };

    return typeSpecificClauses[serviceType] || baseClauses;
  }

  private generateComplianceChecklist(tender: Tender, cfg: LegalConfig): string[] {
    const checklist: string[] = [];
    const offerPct = tender.guarantees?.offer?.percentage ?? cfg.guaranteeOfferPct;
    const perfPct = tender.guarantees?.performance?.percentage ?? cfg.guaranteePerformancePct;

    checklist.push('Inscripción en el Registro Nacional de Constructores (si aplica)');
    checklist.push('Certificación de situación fiscal (AFIP) — Constancia vigente');
    checklist.push('Constancia de inscripción en IVA / Monotributo');
    checklist.push('Balance o estados contables último ejercicio firmado');
    if (cfg.requireWorkAccidentInsurance) {
      checklist.push('Seguro de riesgo de trabajo ART vigente');
    }
    checklist.push(`Garantía de oferta: ${offerPct}% del valor total de la oferta`);
    checklist.push(`Garantía de cumplimiento: ${perfPct}% del valor del contrato`);
    checklist.push('Antecedentes de obras/servicios similares (últimos 5 años)');
    if (cfg.requireISO9001) {
      checklist.push('Certificación ISO 9001 vigente (requerida)');
    } else {
      checklist.push('Certificación ISO 9001 (recomendada, no obligatoria)');
    }
    checklist.push('Personal técnico con matrícula/habilitación vigente');
    checklist.push('Equipamiento e instalaciones adecuadas');
    checklist.push(`Seguro de responsabilidad civil vigente`);
    if (cfg.customClauses.length > 0) {
      cfg.customClauses.forEach(c => checklist.push(`(Propio) ${c}`));
    }
    return checklist;
  }

  private getLegalRecommendations(serviceType: string, tender: Tender, cfg: LegalConfig): string[] {
    const recommendations: string[] = [];
    const daysUntilClose = Math.ceil(
      (new Date(tender.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilClose < 0) {
      recommendations.push('⛔ LICITACIÓN VENCIDA — esta oferta es solo de referencia');
    } else if (daysUntilClose < 7) {
      recommendations.push(`⚠️ PLAZO URGENTE: quedan ${daysUntilClose} días — priorizar preparación`);
    } else if (daysUntilClose < 14) {
      recommendations.push(`Plazo ajustado: ${daysUntilClose} días para cierre — organizar equipo`);
    }

    recommendations.push(`Garantía de oferta (${cfg.guaranteeOfferPct}%): preparar póliza o aval bancario`);
    recommendations.push(`Plazo de pago configurado: ${cfg.paymentDays} días desde factura`);
    recommendations.push(`Penalidad por atraso: ${cfg.penaltyRatePercent}% por día — revisar plan de obra`);
    recommendations.push(`Garantía del producto/servicio: ${cfg.warrantyMonths} meses post-entrega`);

    if (serviceType === 'obra_publica') {
      recommendations.push('Verificar régimen de redeterminación de precios (Decreto 691/2016)');
      recommendations.push('Confirmar habilitación en Registro de Constructores (RNOC)');
      recommendations.push(`Subcontratistas: notificar al comitente — preaviso ${cfg.noticeDays} días`);
    }
    if (serviceType === 'servicio') {
      recommendations.push('Adjuntar planilla de personal afectado al servicio');
      recommendations.push('Verificar convenio colectivo aplicable');
    }
    if (serviceType === 'suministro') {
      recommendations.push('Verificar normas IRAM / especificaciones técnicas del pliego');
      recommendations.push('Prever plazo de entrega vs. stock disponible');
    }

    if (tender.paymentTerms?.advance && tender.paymentTerms.advance > 20) {
      recommendations.push('El anticipo supera el 20% — verificar contragarantía requerida');
    }

    return recommendations;
  }

  async getClauseTemplate(type: string, variables?: Record<string, string>): Promise<LegalClause | null> {
    const template = clauseTemplates[type];
    if (!template) return null;

    let content = template.template;
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });
    }

    return {
      type: template.type,
      description: template.description,
      content,
      accepted: false
    };
  }

  async getAllClauseTemplates(): Promise<LegalClauseTemplate[]> {
    return Object.values(clauseTemplates);
  }

  async checkCompliance(
    tender: Tender,
    companyData: Record<string, boolean>
  ): Promise<{
    compliant: boolean;
    missingItems: string[];
    warnings: string[];
  }> {
    const missingItems: string[] = [];
    const warnings: string[] = [];

    // Check guarantees
    if (tender.guarantees?.offer && !companyData.guaranteeOffer) {
      missingItems.push('Garantía de oferta');
    }
    if (tender.guarantees?.performance && !companyData.guaranteePerformance) {
      missingItems.push('Garantía de cumplimiento');
    }

    // Check certifications
    if (!companyData.iso9001) {
      warnings.push('No se cuenta con certificación ISO 9001 (puede ser requerido)');
    }

    // Check insurance
    if (!companyData.insurance) {
      missingItems.push('Seguro de riesgo de trabajo');
    }

    // Check registration
    if (!companyData.taxReg) {
      missingItems.push('Inscripción fiscal (AFIP)');
    }

    return {
      compliant: missingItems.length === 0,
      missingItems,
      warnings
    };
  }

  async generateComplianceReport(tender: Tender): Promise<string> {
    const analysis = await this.analyzeLegalRequirements(tender);
    
    return `
INFORME DE CUMPLIMIENTO LEGAL
==============================

MARCO LEGAL APLICABLE
---------------------
Ley: ${analysis.framework.law}
Decreto: ${analysis.framework.decree}
Reglamento: ${analysis.framework.regulation}

CLÁUSULAS REQUERIDAS
--------------------
${analysis.requiredClauses.join('\n')}

CHECKLIST DE CUMPLIMIENTO
-------------------------
${analysis.complianceChecklist.map(item => `- ${item}`).join('\n')}

RECOMENDACIONES
---------------
${analysis.recommendations.map(item => `- ${item}`).join('\n')}
    `.trim();
  }
}

export const legalService = new LegalService();
