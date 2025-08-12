import { DataLoader } from './data-loader.js';
import { buildIndex, filterTerms, debounce } from './search.js';

const state = {
  index: null,
  examsMeta: [],
  datasets: [],
  indexed: [],
  filtered: [],
  favorites: new Set(),
  query: '',
  session: 'both',
  yearFrom: 2015,
  yearTo: 2025,
  examCode: '__all__',
  category: '__all__',
  page: 1,
  pageSize: 50
};

const els = {
  q: document.getElementById('q'),
  exportBtn: document.getElementById('exportBtn'),
  randomBtn: document.getElementById('randomBtn'),
  examSelect: document.getElementById('examSelect'),
  sessionSelect: document.getElementById('sessionSelect'),
  yearFrom: document.getElementById('yearFrom'),
  yearTo: document.getElementById('yearTo'),
  category: document.getElementById('categorySelect'),
  favOnly: document.getElementById('favOnly'),
  crumbs: document.getElementById('crumbs'),
  stats: document.getElementById('stats'),
  loading: document.getElementById('loading'),
  results: document.getElementById('results'),
  pager: document.getElementById('pager'),
  modal: document.getElementById('modal'),
  modalBody: document.getElementById('modalBody'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
  modalNextBtn: document.getElementById('modalNextBtn'),
  modalBackdrop: document.getElementById('modalBackdrop')
};

const loader = new DataLoader('./');

function loadPrefs() {
  try {
    const raw = localStorage.getItem('ap_vocab_prefs');
    if (!raw) return;
    const p = JSON.parse(raw);
    Object.assign(state, p);
  } catch {}
}
function savePrefs() {
  const { query, session, yearFrom, yearTo, examCode, category } = state;
  localStorage.setItem('ap_vocab_prefs', JSON.stringify({ query, session, yearFrom, yearTo, examCode, category }));
}

function setLoading(v) { els.loading.classList.toggle('hidden', !v); }

function clearSearch() {
  state.query = '';
  if (els.q) els.q.value = '';
}

function updateCrumbs() {
  const exam = state.examCode === '__all__' ? 'All Exams' : (state.examsMeta.find(e => e.code === state.examCode)?.japaneseName || state.examCode);
  const sess = state.session === 'both' ? 'Both Sessions' : state.session.toUpperCase();
  const years = `${state.yearFrom}–${state.yearTo}`;
  const cat = state.category === '__all__' ? 'All Categories' : state.category;
  els.crumbs.textContent = `${exam} • ${sess} • ${years} • ${cat}`;
}

function exportCSV(items) {
  const header = ['English','Japanese','Roomaji','Description','Category','Exam'];
  const rows = items.map(it => [it.english, it.japanese, it.roomaji, it.description, it.category, it._examLabel]);
  const esc = (v) => '"' + String(v ?? '').replace(/"/g,'""') + '"';
  const csv = [header.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ap_vocab_results.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildCategoryList() {
  const cats = new Set();
  state.datasets.forEach(ds => ds.categories.forEach(c => cats.add(c.name)));
  els.category.innerHTML = `<option value="__all__">All Categories</option>` +
    [...cats].sort((a,b)=>a.localeCompare(b)).map(c=>`<option value="${c.replace(/"/g,'&quot;')}">${c}</option>`).join('');
}

function buildExamList() {
  els.examSelect.innerHTML = `<option value="__all__">All Exams</option>` +
    state.examsMeta
    .filter(e => (state.session==='both'||e.session===state.session) && e.year>=state.yearFrom && e.year<=state.yearTo)
    .sort((a,b)=> (a.year-b.year) || a.season.localeCompare(b.season) || a.session.localeCompare(b.session))
    .map(e => `<option value="${e.code}">${e.year} ${e.season} ${e.session.toUpperCase()} • ${e.japaneseName}</option>`)
    .join('');
}

function buildYearSelects(index) {
  els.yearFrom.innerHTML = index.years.map(y=>`<option value="${y}">${y}</option>`).join('');
  els.yearTo.innerHTML = index.years.map(y=>`<option value="${y}">${y}</option>`).join('');
  els.yearFrom.value = state.yearFrom;
  els.yearTo.value = state.yearTo;
}

function computeStats() {
  const exams = new Set(state.filtered.map(t => t._examCode));
  els.stats.textContent = `Showing ${state.filtered.length} terms from ${exams.size} exams`;
}

function render() {
  // pagination
  const total = state.filtered.length;
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * state.pageSize;
  const slice = state.filtered.slice(start, start + state.pageSize);

  const frag = document.createDocumentFragment();
  slice.forEach(it => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="card__head">
        <div class="term-en">${it.english}</div>
        <span class="tag">${it._examLabel}</span>
      </div>
      <div class="term-ja">${it.japanese}</div>
      <div class="term-ro">${it.roomaji}</div>
      <div class="desc">${it.description.replace(/\*\*(.+?)\*\*/g,'<br/><strong>$1</strong>').replace(/^<br\/>/,'')}</div>
      <div class="card__foot">
        <button class="fav" data-id="${it._id}" data-active="${state.favorites.has(it._id)}">${state.favorites.has(it._id)?'⭐':'☆'} Favorite</button>
        <span class="tag">${it.category}</span>
      </div>`;
    frag.appendChild(card);
  });
  els.results.innerHTML = '';
  els.results.appendChild(frag);

  // favorites handlers
  els.results.querySelectorAll('.fav').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
      btn.setAttribute('data-active', String(state.favorites.has(id)));
      btn.textContent = (state.favorites.has(id)?'⭐':'☆') + ' Favorite';
      savePrefs();
      if (state.favOnly) applyFilters();
    });
  });

  // pager
  renderPager(pages);
  computeStats();
}

function renderPager(pages) {
  const p = els.pager;
  if (pages <= 1) { p.classList.add('hidden'); p.innerHTML=''; return; }
  p.classList.remove('hidden');
  const makeBtn = (label, page, current=false) => {
    const b = document.createElement('button');
    b.className = 'page-btn';
    b.textContent = label;
    b.setAttribute('aria-current', String(current));
    b.disabled = current;
    b.addEventListener('click', () => { state.page = page; render(); });
    return b;
  };
  p.innerHTML = '';
  p.appendChild(makeBtn('«', 1, state.page===1));
  p.appendChild(makeBtn('‹', Math.max(1, state.page-1), false));
  const windowSize = 5;
  const start = Math.max(1, state.page - Math.floor(windowSize/2));
  const end = Math.min(pages, start + windowSize - 1);
  for (let i = start; i <= end; i++) { p.appendChild(makeBtn(String(i), i, i===state.page)); }
  p.appendChild(makeBtn('›', Math.min(pages, state.page+1), false));
  p.appendChild(makeBtn('»', pages, state.page===pages));
}

function applyFilters() {
  const tokens = (state.query||'').toLowerCase().split(/\s+/).filter(Boolean);
  let terms = state.indexed;
  if (state.examCode !== '__all__') terms = terms.filter(t => t._examCode === state.examCode);
  if (state.session !== 'both') terms = terms.filter(t => t._session === state.session);
  terms = filterTerms(terms, tokens);
  if (state.category !== '__all__') terms = terms.filter(t => t.category === state.category);
  if (state.favOnly) terms = terms.filter(t => state.favorites.has(t._id));
  state.filtered = terms;
  state.page = 1;
  render();
}

async function refreshData() {
  setLoading(true);
  try {
    const datasets = await loader.loadSelectedExams({
      session: state.session,
      yearFrom: state.yearFrom,
      yearTo: state.yearTo,
      codes: state.examCode==='__all__'?[]:[state.examCode]
    });
    state.datasets = datasets;
    // flatten
    const terms = [];
    for (const ds of datasets) {
      const label = `${ds.examInfo.year} ${ds.examInfo.season} ${ds.examInfo.session.toUpperCase()} • ${ds.examInfo.japaneseName}`;
      const code = ds.examInfo.code;
      const session = ds.examInfo.session;
      ds.categories.forEach(cat => {
        cat.terms.forEach(t => {
          terms.push({
            ...t,
            _examLabel: label,
            _examCode: code,
            _session: session,
            _id: `${code}|${t.english}|${t.japanese}`
          });
        })
      })
    }
    state.indexed = buildIndex(terms);
    buildCategoryList();
    applyFilters();
  } finally { setLoading(false); }
}

async function init() {
  loadPrefs();
  const index = await loader.loadIndex();
  state.index = index;
  state.examsMeta = index.availableExams;

  // build years
  buildYearSelects(index);
  // build exam dropdown
  buildExamList();

  // bind events
  els.q.addEventListener('input', debounce((e) => { state.query = e.target.value; savePrefs(); applyFilters(); }, 300));
  els.exportBtn.addEventListener('click', () => exportCSV(state.filtered));
  const openModalWith = (it) => {
    const cardHtml = `
      <article class="card">
        <div class="card__head">
          <div class="term-en">${it.english}</div>
          <span class="tag">${it._examLabel}</span>
        </div>
        <div class="term-ja">${it.japanese}</div>
        <div class="term-ro">${it.roomaji}</div>
        <div class="desc">${it.description.replace(/\*\*(.+?)\*\*/g,'<br/><strong>$1</strong>').replace(/^<br\/>/,'')}</div>
        <div class="card__foot">
          <button class="fav" data-id="${it._id}" data-active="${state.favorites.has(it._id)}">${state.favorites.has(it._id)?'⭐':'☆'} Favorite</button>
          <span class="tag">${it.category}</span>
        </div>
      </article>`;
    els.modalBody.innerHTML = cardHtml;
    els.modal.classList.remove('hidden');
    els.modal.setAttribute('aria-hidden', 'false');
    // bind favorite inside modal
    const fav = els.modalBody.querySelector('.fav');
    fav.addEventListener('click', () => {
      const id = fav.getAttribute('data-id');
      if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
      fav.setAttribute('data-active', String(state.favorites.has(id)));
      fav.textContent = (state.favorites.has(id)?'⭐':'☆') + ' Favorite';
      savePrefs();
    });
  };

  const pickRandom = () => {
    const arr = state.filtered.length ? state.filtered : state.indexed;
    if (!arr.length) return null;
    return arr[Math.floor(Math.random()*arr.length)];
  };

  els.randomBtn.addEventListener('click', () => {
    const it = pickRandom();
    if (!it) return;
    openModalWith(it);
  });

  const closeModal = () => {
    els.modal.classList.add('hidden');
    els.modal.setAttribute('aria-hidden', 'true');
  };
  els.modalCloseBtn.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', closeModal);
  els.modalNextBtn.addEventListener('click', () => {
    const it = pickRandom();
    if (!it) return;
    openModalWith(it);
  });
  els.sessionSelect.value = state.session;
  els.sessionSelect.addEventListener('change', (e)=>{ state.session = e.target.value; clearSearch(); savePrefs(); buildExamList(); updateCrumbs(); refreshData();});
  els.yearFrom.addEventListener('change', (e)=>{ state.yearFrom = Number(e.target.value); if (state.yearFrom>state.yearTo) state.yearTo = state.yearFrom; clearSearch(); savePrefs(); buildExamList(); updateCrumbs(); refreshData(); });
  els.yearTo.addEventListener('change', (e)=>{ state.yearTo = Number(e.target.value); if (state.yearTo<state.yearFrom) state.yearFrom = state.yearTo; clearSearch(); savePrefs(); buildExamList(); updateCrumbs(); refreshData(); });
  els.examSelect.addEventListener('change', (e)=>{ state.examCode = e.target.value; clearSearch(); savePrefs(); updateCrumbs(); refreshData(); });
  els.category.addEventListener('change', (e)=>{ state.category = e.target.value; clearSearch(); savePrefs(); applyFilters(); updateCrumbs(); });
  els.favOnly.addEventListener('change', (e)=>{ state.favOnly = !!e.target.checked; savePrefs(); applyFilters(); });

  updateCrumbs();
  await refreshData();
}

init().catch(err => {
  console.error(err);
  els.loading.classList.remove('hidden');
  els.loading.textContent = 'Failed to initialize. Check console for details.';
});


