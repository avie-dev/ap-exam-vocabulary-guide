# AP Exam Vocabulary System

Modular, scalable vocabulary search for 10 years of AP exam sessions (AM/PM). Loads data on demand and supports filtering by year, session, exam, category, and search term.

## Quick Start

1. Open `index.html` in your browser (no build needed). For local `fetch()` to work reliably, use a simple static server:

```bash
cd vocabulary-system
python3 -m http.server 8080
# then open http://localhost:8080
```

2. Use the filters to select exam(s), session, and years. Type in the search box for instant filtering.

## Structure

```
vocabulary-system/
├── index.html
├── css/styles.css
├── js/
│   ├── app.js
│   ├── search.js
│   └── data-loader.js
└── data/
    ├── vocabulary-index.json
    └── am/ap-2025-spring.json
```

## Adding Exams

1. Place exam JSON files under `data/am/` or `data/pm/`.
2. Update `data/vocabulary-index.json` with the new exam metadata and path.

## JSON Format

See `data/am/ap-2025-spring.json` for the expected format. Each exam file includes `examInfo` and an array of category objects, each with `terms`.

## Notes

- Data is loaded on demand and cached in-memory.
- Preferences (filters) are saved in `localStorage`.
- CSV export operates on the current filtered results.


