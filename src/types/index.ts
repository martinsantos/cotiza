// Core Types for cotizAR CLI

export interface Tender {
  id: string;
  number: string;
  title: string;
  description: string;
  agency: string;
  region: string;
  category: string;
  status: 'abierta' | 'cerrada' | 'adjudicada' | 'desierta';
  openingDate: string;
  closingDate: string;
  budget: number;
  currency: 'ARS' | 'USD';
  requirements: TenderRequirement[];
  documents: TenderDocument[];
  terms: TenderTerms;
  legalFramework?: LegalFramework;
  paymentTerms?: PaymentTerms;
  guarantees?: Guarantees;
}

export interface LegalFramework {
  law: string;
  decree: string;
  regulation: string;
}

export interface PaymentTerms {
  type: string;
  advance: number;
  milestones: Array<{ milestone: string; percentage: number }>;
}

export interface Guarantees {
  offer: { percentage: number; amount: number };
  performance: { percentage: number; amount: number };
  technical: { percentage: number; amount: number };
}

export interface TenderRequirement {
  id: string;
  type: 'technical' | 'commercial' | 'legal' | 'administrative';
  description: string;
  mandatory: boolean;
  weight?: number;
}

export interface TenderDocument {
  id: string;
  name: string;
  type: string;
  url?: string;
  content?: string;
}

export interface TenderTerms {
  deliveryTime: string;
  placeOfDelivery: string;
  warranty?: string;
  validityOfOffer: number;
}

export interface LineItem {
  id: string;
  description: string;
  unit: string;       // unidad de medida: un, m², kg, hora, gl, etc.
  quantity: number;
  unitPrice: number;
  subtotal: number;   // quantity * unitPrice
  notes?: string;
}

export interface Bid {
  id: string;
  tenderId: string;
  companyId: string;
  status: 'draft' | 'analyzing' | 'ready' | 'submitted' | 'accepted' | 'rejected';
  lineItems: LineItem[];          // renglones de la oferta
  notes: string;                  // notas generales de la oferta
  internalNotes: string;          // notas internas (no se imprimen)
  technicalProposal: TechnicalProposal;
  commercialOffer: CommercialOffer;
  legalCompliance: LegalCompliance;
  competitivenessScore?: number;
  complianceMatrix: ComplianceItem[];
  analysis?: BidAnalysis;
  documentsGenerated: GeneratedDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface TechnicalProposal {
  methodology: string;
  workPlan: WorkPlanItem[];
  resources: Resource[];
  schedule: Schedule;
  experience: Experience[];
}

export interface WorkPlanItem {
  phase: string;
  description: string;
  duration: number;
  unit: 'days' | 'weeks' | 'months';
}

export interface Resource {
  type: 'human' | 'equipment' | 'material';
  description: string;
  quantity: number;
  unit: string;
}

export interface Schedule {
  startDate: string;
  endDate: string;
  milestones: Milestone[];
}

export interface Milestone {
  name: string;
  date: string;
  deliverables: string[];
}

export interface Experience {
  projectName: string;
  client: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
}

export interface CommercialOffer {
  basePrice: number;
  discount: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: 'ARS' | 'USD';
  paymentTerms: string;
  validityDays: number;
}

export interface LegalCompliance {
  framework: string;
  clauses: LegalClause[];
  isCompliant: boolean;
}

export interface LegalClause {
  type: string;
  description: string;
  accepted: boolean;
  content?: string;
  notes?: string;
}

export interface ComplianceItem {
  requirementId: string;
  description: string;
  response: string;
  compliant: boolean;
  evidence?: string;
}

export interface BidAnalysis {
  strengths: string[];
  weaknesses: string[];
  risks: RiskItem[];
  recommendations: string[];
  winProbability: number;
}

export interface RiskItem {
  description: string;
  severity: 'low' | 'medium' | 'high';
  probability: number;
  mitigation?: string;
}

export interface GeneratedDocument {
  id: string;
  type: 'technical' | 'commercial' | 'summary' | 'annex';
  name: string;
  format: 'pdf' | 'docx' | 'html';
  path?: string;
  generatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  taxId: string;
  address: Address;
  contact: Contact;
  certifications: Certification[];
  experience: Experience[];
}

export interface Address {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export interface Contact {
  name: string;
  email: string;
  phone: string;
}

export interface Certification {
  name: string;
  issuer: string;
  validUntil?: string;
}

export interface PatternBundle {
  id: string;
  tenderType: string;
  sections: PatternSection[];
  commonTexts: string[];
  templates: string[];
  pricePatterns: PricePattern;
  formats: string[];
  usageCount: number;
  successRate: number;
}

export interface PatternSection {
  name: string;
  content: string;
  order: number;
}

export interface PricePattern {
  averageMarkup: number;
  typicalDiscount: number;
  commonPaymentTerms: string[];
}

export interface MarketData {
  materialCode: string;
  name: string;
  currentPrice: number;
  previousPrice: number;
  unit: string;
  currency: string;
  lastUpdated: string;
  trend: 'up' | 'down' | 'stable';
  source: string;
}

export interface CurrencyData {
  pair: string;
  buy: number;
  sell: number;
  lastUpdated: string;
}

export interface InflationData {
  period: string;
  monthly: number;
  annual: number;
  source: string;
  lastUpdated: string;
}

export interface TenderTracking {
  tenderId: string;
  milestones: TrackingMilestone[];
  alerts: Alert[];
}

export interface TrackingMilestone {
  name: string;
  date: string;
  completed: boolean;
  notes?: string;
}

export interface Alert {
  type: 'deadline' | 'extension' | 'query' | 'opening' | 'result';
  message: string;
  date: string;
  read: boolean;
}

export interface CompetitiveAnalysis {
  tenderId: string;
  historicalData: HistoricalBid[];
  competitors: Competitor[];
  benchmark: Benchmark;
  score: CompetitiveScore;
}

export interface HistoricalBid {
  tenderId: string;
  category: string;
  amount: number;
  winner: boolean;
  year: number;
}

export interface Competitor {
  name: string;
  winRate: number;
  averageBid: number;
  zone: string;
}

export interface Benchmark {
  averageMarketPrice: number;
  lowestWinningPrice: number;
  highestWinningPrice: number;
}

export interface CompetitiveScore {
  total: number;
  priceScore: number;
  technicalScore: number;
  experienceScore: number;
}

export interface Config {
  company: Company;
  defaults: {
    currency: 'ARS' | 'USD';
    taxRate: number;
    profitMargin: number;
    outputDirectory: string;
  };
  templates: {
    technical: string;
    commercial: string;
    legal: string;
  };
  tracking: {
    alertDaysBefore: number[];
    notifications: boolean;
  };
  market: {
    updateFrequency: string;
    sources: string[];
  };
  api: {
    port: number;
    host: string;
  };
}
