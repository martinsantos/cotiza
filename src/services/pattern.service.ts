import { PatternBundle, PatternSection, PricePattern } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';

function rowToPattern(row: any): PatternBundle {
  return {
    id: row.id,
    tenderType: row.tender_type,
    sections: JSON.parse(row.sections || '[]'),
    commonTexts: JSON.parse(row.common_texts || '[]'),
    templates: JSON.parse(row.templates || '[]'),
    pricePatterns: JSON.parse(row.price_patterns || '{}'),
    formats: JSON.parse(row.formats || '[]'),
    usageCount: row.usage_count,
    successRate: row.success_rate,
  };
}

export class PatternService {
  async search(query: string): Promise<PatternBundle[]> {
    const db = getDb();
    const pattern = `%${query}%`;
    const rows = db.prepare(`
      SELECT * FROM patterns
      WHERE tender_type LIKE ? COLLATE NOCASE
         OR sections LIKE ? COLLATE NOCASE
         OR common_texts LIKE ? COLLATE NOCASE
    `).all(pattern, pattern, pattern);

    // Score and sort results for relevance (matching original logic)
    const queryWords = query.toLowerCase().split(/\s+/);
    const scored = rows.map(row => {
      const p = rowToPattern(row);
      let score = 0;

      queryWords.forEach(word => {
        if (p.tenderType.toLowerCase().includes(word)) {
          score += 10;
        }
        p.commonTexts.forEach(text => {
          if (text.toLowerCase().includes(word)) {
            score += 2;
          }
        });
        p.sections.forEach(s => {
          if (s.name.toLowerCase().includes(word) || s.content.toLowerCase().includes(word)) {
            score += 1;
          }
        });
      });

      return { pattern: p, score };
    });

    return scored
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.pattern);
  }

  async getByType(tenderType: string): Promise<PatternBundle | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM patterns WHERE tender_type = ?').get(tenderType);
    return row ? rowToPattern(row) : null;
  }

  async list(): Promise<PatternBundle[]> {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM patterns').all();
    return rows.map(rowToPattern);
  }

  async create(pattern: Partial<PatternBundle>): Promise<PatternBundle> {
    const newPattern: PatternBundle = {
      id: pattern.id || `pattern-${uuidv4().slice(0, 8)}`,
      tenderType: pattern.tenderType || '',
      sections: pattern.sections || [],
      commonTexts: pattern.commonTexts || [],
      templates: pattern.templates || [],
      pricePatterns: pattern.pricePatterns || {
        averageMarkup: 15,
        typicalDiscount: 5,
        commonPaymentTerms: ['mensual']
      },
      formats: pattern.formats || ['PDF'],
      usageCount: 0,
      successRate: 0
    };

    const db = getDb();
    db.prepare(`
      INSERT INTO patterns (id, tender_type, sections, common_texts, templates, price_patterns, formats, usage_count, success_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newPattern.id,
      newPattern.tenderType,
      JSON.stringify(newPattern.sections),
      JSON.stringify(newPattern.commonTexts),
      JSON.stringify(newPattern.templates),
      JSON.stringify(newPattern.pricePatterns),
      JSON.stringify(newPattern.formats),
      newPattern.usageCount,
      newPattern.successRate,
    );

    return newPattern;
  }

  async updateUsage(patternId: string, success: boolean): Promise<void> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM patterns WHERE id = ?').get(patternId);
    if (!row) return;

    const pattern = rowToPattern(row);
    pattern.usageCount++;
    if (success) {
      pattern.successRate = (pattern.successRate * (pattern.usageCount - 1) + 1) / pattern.usageCount;
    } else {
      pattern.successRate = (pattern.successRate * (pattern.usageCount - 1)) / pattern.usageCount;
    }

    db.prepare(`
      UPDATE patterns SET usage_count = ?, success_rate = ? WHERE id = ?
    `).run(pattern.usageCount, pattern.successRate, patternId);
  }

  async getTemplates(tenderType: string): Promise<string[]> {
    const pattern = await this.getByType(tenderType);
    return pattern?.templates || [];
  }

  async getCommonSections(tenderType: string): Promise<PatternSection[]> {
    const pattern = await this.getByType(tenderType);
    return pattern?.sections || [];
  }
}

export const patternService = new PatternService();
