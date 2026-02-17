export const schema = `
CREATE TABLE IF NOT EXISTS tenders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  agency TEXT DEFAULT '',
  region TEXT DEFAULT '',
  category TEXT DEFAULT 'Servicios',
  status TEXT DEFAULT 'abierta',
  opening_date TEXT,
  closing_date TEXT,
  budget REAL DEFAULT 0,
  currency TEXT DEFAULT 'ARS',
  requirements TEXT DEFAULT '[]',
  documents TEXT DEFAULT '[]',
  terms TEXT DEFAULT '{}',
  legal_framework TEXT,
  payment_terms TEXT,
  guarantees TEXT,
  source TEXT DEFAULT 'manual',
  source_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bids (
  id TEXT PRIMARY KEY,
  tender_id TEXT NOT NULL,
  company_id TEXT,
  status TEXT DEFAULT 'draft',
  technical_proposal TEXT DEFAULT '{}',
  commercial_offer TEXT DEFAULT '{}',
  legal_compliance TEXT DEFAULT '{}',
  compliance_matrix TEXT DEFAULT '[]',
  analysis TEXT,
  competitiveness_score REAL,
  documents_generated TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tender_id) REFERENCES tenders(id)
);

CREATE TABLE IF NOT EXISTS market_materials (
  material_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  current_price REAL DEFAULT 0,
  previous_price REAL DEFAULT 0,
  unit TEXT DEFAULT '',
  currency TEXT DEFAULT 'ARS',
  last_updated TEXT,
  trend TEXT DEFAULT 'stable',
  source TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS market_currencies (
  pair TEXT PRIMARY KEY,
  buy REAL DEFAULT 0,
  sell REAL DEFAULT 0,
  last_updated TEXT,
  source TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS market_inflation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT,
  monthly REAL DEFAULT 0,
  annual REAL DEFAULT 0,
  source TEXT DEFAULT '',
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS historical_bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id TEXT,
  tender_category TEXT,
  company_name TEXT,
  amount REAL DEFAULT 0,
  winner INTEGER DEFAULT 0,
  year INTEGER,
  region TEXT,
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  win_rate REAL DEFAULT 0,
  average_bid REAL DEFAULT 0,
  zone TEXT DEFAULT '',
  total_bids INTEGER DEFAULT 0,
  last_seen TEXT,
  source TEXT DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  tender_type TEXT NOT NULL,
  sections TEXT DEFAULT '[]',
  common_texts TEXT DEFAULT '[]',
  templates TEXT DEFAULT '[]',
  price_patterns TEXT DEFAULT '{}',
  formats TEXT DEFAULT '[]',
  usage_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracking (
  tender_id TEXT PRIMARY KEY,
  milestones TEXT DEFAULT '[]',
  alerts TEXT DEFAULT '[]',
  FOREIGN KEY (tender_id) REFERENCES tenders(id)
);

CREATE TABLE IF NOT EXISTS legal_templates (
  type TEXT PRIMARY KEY,
  description TEXT DEFAULT '',
  template TEXT DEFAULT '',
  category TEXT DEFAULT 'general'
);

CREATE INDEX IF NOT EXISTS idx_tenders_status ON tenders(status);
CREATE INDEX IF NOT EXISTS idx_tenders_region ON tenders(region);
CREATE INDEX IF NOT EXISTS idx_tenders_category ON tenders(category);
CREATE INDEX IF NOT EXISTS idx_tenders_closing ON tenders(closing_date);
CREATE INDEX IF NOT EXISTS idx_tenders_source ON tenders(source, source_id);
CREATE INDEX IF NOT EXISTS idx_bids_tender ON bids(tender_id);
CREATE INDEX IF NOT EXISTS idx_bids_status ON bids(status);
CREATE INDEX IF NOT EXISTS idx_historical_year ON historical_bids(year);
CREATE INDEX IF NOT EXISTS idx_historical_category ON historical_bids(tender_category);
CREATE INDEX IF NOT EXISTS idx_competitors_zone ON competitors(zone);
`;
