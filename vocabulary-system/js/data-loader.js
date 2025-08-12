export class DataLoader {
  constructor(basePath = './') {
    this.basePath = basePath;
    this.cache = new Map(); // code -> dataset
    this.index = null;      // master index
  }

  async loadIndex() {
    if (this.index) return this.index;
    const res = await fetch(`${this.basePath}data/vocabulary-index.json`);
    if (!res.ok) throw new Error(`Failed to load vocabulary-index.json (${res.status})`);
    this.index = await res.json();
    return this.index;
  }

  async loadExam(filePath) {
    // normalize path
    const url = `${this.basePath}${filePath}`;
    if (this.cache.has(url)) return this.cache.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${filePath} (${res.status})`);
    const data = await res.json();
    this.cache.set(url, data);
    return data;
  }

  async loadSelectedExams({ session = 'both', yearFrom, yearTo, codes = [] }) {
    const index = await this.loadIndex();
    let list = index.availableExams;
    if (session !== 'both') list = list.filter(e => e.session === session);
    if (yearFrom != null) list = list.filter(e => e.year >= yearFrom);
    if (yearTo != null) list = list.filter(e => e.year <= yearTo);
    if (codes && codes.length) list = list.filter(e => codes.includes(e.code));

    const results = [];
    for (const e of list) {
      try {
        const data = await this.loadExam(e.filePath);
        results.push(data);
      } catch (err) {
        console.warn('Missing data file:', e.filePath, err);
      }
    }
    return results;
  }
}


