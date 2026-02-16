import { Tender, LegalFramework, LegalClause, PaymentTerms, Guarantees } from '../types/index.js';

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
  async analyzeLegalRequirements(tender: Tender): Promise<{
    framework: LegalFramework;
    requiredClauses: string[];
    complianceChecklist: string[];
    recommendations: string[];
  }> {
    const serviceType = this.detectServiceType(tender);
    const framework = this.getFramework(serviceType, tender.legalFramework);

    const requiredClauses = this.getRequiredClauses(serviceType);
    const complianceChecklist = this.generateComplianceChecklist(tender);
    const recommendations = this.getLegalRecommendations(serviceType, tender);

    return {
      framework,
      requiredClauses,
      complianceChecklist,
      recommendations
    };
  }

  private detectServiceType(tender: Tender): string {
    const category = tender.category.toLowerCase();
    if (category.includes('obra') || category.includes('construcción')) {
      return 'obra_publica';
    }
    if (category.includes('servicio') || category.includes('limpieza')) {
      return 'servicio';
    }
    if (category.includes('suministro') || category.includes('compra')) {
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

  private generateComplianceChecklist(tender: Tender): string[] {
    const checklist: string[] = [];

    // General requirements
    checklist.push('Inscripción en el Registro Nacional de Constructores (si aplica)');
    checklist.push('Certificación de situación fiscal (AFIP)');
    checklist.push('Constancia de inscripción en IVA');
    checklist.push('Balance último ejercicio');
    checklist.push('Seguro de riesgo de trabajo vigente');

    // Payment terms
    if (tender.paymentTerms?.advance) {
      checklist.push(`Garantía de anticipo: ${tender.paymentTerms.advance}%`);
    }
    if (tender.guarantees?.offer) {
      checklist.push(`Garantía de oferta: ${tender.guarantees.offer.percentage}%`);
    }
    if (tender.guarantees?.performance) {
      checklist.push(`Garantía de cumplimiento: ${tender.guarantees.performance.percentage}%`);
    }

    // Experience requirements
    checklist.push('Antecedentes de obras/servicios similares');

    // Technical requirements
    checklist.push('Certificaciones técnicas vigentes (ISO 9001 si aplica)');
    checklist.push('Personal técnico capacitado');
    checklist.push('Equipamiento adecuado');

    return checklist;
  }

  private getLegalRecommendations(serviceType: string, tender: Tender): string[] {
    const recommendations: string[] = [];

    // General recommendations
    recommendations.push('Revisar cuidadosamente los plazos de presentación');
    recommendations.push('Verificar que todos los documentos estén vigentes');
    recommendations.push('Confirmar los montos de garantías requeridas');

    // Type-specific recommendations
    if (serviceType === 'obra_publica') {
      recommendations.push('Revisar el régimen de redeterminación de precios');
      recommendations.push('Verificar los plazos de obra y penalizaciones');
      recommendations.push('Confirmar los requisitos de subcontratistas');
    }

    if (serviceType === 'servicio') {
      recommendations.push('Revisar el régimen de personal mínimo');
      recommendations.push('Verificar los requisitos de supervisión');
      recommendations.push('Confirmar los controles de calidad exigidos');
    }

    // Payment recommendations
    if (tender.paymentTerms?.advance && tender.paymentTerms.advance > 20) {
      recommendations.push('El anticipo supera el 20%, verificar garantías');
    }

    // Deadline recommendations
    const daysUntilClose = Math.ceil(
      (new Date(tender.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilClose < 14) {
      recommendations.push('PLAZO CORTO: Priorizar la preparación de la oferta');
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
