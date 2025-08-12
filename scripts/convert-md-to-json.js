#!/usr/bin/env node
/**
 * Convert AP AM markdown guide to vocabulary JSON format.
 * Usage: node scripts/convert-md-to-json.js guides/am/ap-2025-spring.md vocabulary-system/data/am/ap-2025-spring.json
 */
const fs = require('fs');
const path = require('path');

function normalizeSpaces(s) { return s.replace(/\s+/g, ' ').trim(); }

function parseMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const categories = new Map(); // name -> { name, japaneseName, terms: [] }
  let currentTop = null;
  let currentJa = '';

  const isSep = (s) => {
    const t = (s || '').trim();
    if (!t.includes('-')) return false;
    return t.replace(/[|:\s\-]/g, '') === '';
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (line.startsWith('## ')) {
      // Extract top-level category name and japaneseName in parens, if present
      const title = normalizeSpaces(line.replace(/^##\s+/, ''));
      const m = title.match(/^(.*)\s*\(([^)]+)\)$/);
      if (m) { currentTop = m[1].trim(); currentJa = m[2].trim(); }
      else { currentTop = title; currentJa = ''; }
      if (!categories.has(currentTop)) categories.set(currentTop, { name: currentTop, japaneseName: currentJa, terms: [] });
      continue;
    }
    if (line.startsWith('### ')) {
      // We keep subcategory only for context; category field on term remains top-level
      continue;
    }
    if (!currentTop) continue;

    // Detect table start
    if (line.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      const header = line.split('|').map(c => c.trim()).filter(Boolean);
      const headerMap = {};
      header.forEach((h, idx) => headerMap[h.toLowerCase()] = idx);
      const idxEn = headerMap['english term'] ?? headerMap['english'] ?? 0;
      const idxJa = headerMap['japanese'] ?? 1;
      const idxRo = headerMap['roomaji'] ?? headerMap['romanji'] ?? 2;
      const idxDesc = header.length - 1;

      // Advance past separator
      i += 2;
      for (; i < lines.length; i++) {
        const row = (lines[i] ?? '').trim();
        if (!row.includes('|') || row.startsWith('##') || row.startsWith('###')) { i--; break; }
        const cells = row.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length < 3) continue;
        const english = normalizeSpaces(cells[idxEn] || '');
        const japanese = normalizeSpaces(cells[idxJa] || '');
        const roomaji = normalizeSpaces(cells[idxRo] || '');
        const description = normalizeSpaces(cells[idxDesc] || '');
        if (!english && !japanese && !roomaji && !description) continue;
        categories.get(currentTop).terms.push({
          english, japanese, roomaji, description, category: currentTop
        });
      }
    }
  }
  return Array.from(categories.values());
}

function main() {
  const [,, inputMd, outputJson] = process.argv;
  if (!inputMd || !outputJson) {
    console.error('Usage: node scripts/convert-md-to-json.js <input.md> <output.json>');
    process.exit(1);
  }
  const md = fs.readFileSync(path.resolve(inputMd), 'utf8');
  const categories = parseMarkdown(md);

  // Derive exam info from filename pattern ap-YYYY-season.md
  const base = path.basename(inputMd, '.md');
  const m = base.match(/ap-(\d{4})-(spring|fall)/);
  const year = m ? Number(m[1]) : null;
  const season = m ? m[2] : '';
  const session = 'am';
  const examInfo = {
    code: `ap-${year}-${season}`,
    year,
    season,
    session,
    japaneseName: `令和${year-2018}年度 ${season==='spring'?'春期':'秋期'} 午前`,
    examDate: year===2025 && season==='spring' ? 'April 20, 2025' : ''
  };

  const data = { examInfo, categories };
  fs.mkdirSync(path.dirname(outputJson), { recursive: true });
  fs.writeFileSync(outputJson, JSON.stringify(data, null, 2), 'utf8');

  // Update index termCount if exists nearby
  try {
    const indexPath = path.resolve(path.dirname(outputJson), '..', 'vocabulary-index.json');
    if (fs.existsSync(indexPath)) {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      const termCount = categories.reduce((n, c) => n + c.terms.length, 0);
      const entry = index.availableExams.find(e => e.code === examInfo.code && e.session === session);
      if (entry) { entry.termCount = termCount; entry.status = 'complete'; }
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
      console.log(`Updated index termCount=${termCount}`);
    }
  } catch (e) { console.warn('Index update skipped:', e.message); }

  console.log('Wrote', outputJson);
}

main();


