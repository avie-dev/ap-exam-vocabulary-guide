export function buildIndex(terms) {
  return terms.map(t => ({
    ...t,
    _idx: `${(t.english||'').toLowerCase()} ${(t.japanese||'').toLowerCase()} ${(t.roomaji||'').toLowerCase()} ${(t.description||'').toLowerCase()}`
  }));
}

export function filterTerms(indexed, tokens) {
  if (!tokens.length) return indexed;
  return indexed.filter(t => tokens.every(tok => t._idx.includes(tok)));
}

export function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}


