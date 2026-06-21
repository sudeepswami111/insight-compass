
# InsightForge — Build Plan

## Stack reality check (important)

Your spec asks for FastAPI + Celery + Redis + Prophet/XGBoost in Docker. Lovable runs a TypeScript-only serverless runtime (Cloudflare Workers) with managed Postgres/auth/storage — Python and native ML libs can't execute here. To keep the project fully runnable inside Lovable with no external infra, the entire pipeline will be **TypeScript-native**, with an LLM (via the Lovable AI Gateway) writing the plain-language narrative and recommendations on top of real statistical output. You keep the two-layer (Analysis + Science) product; you trade Prophet/XGBoost for solid JS equivalents.

If you later want Prophet/XGBoost specifically, the clean path is to host a small FastAPI service yourself and have Lovable call it — additive, not a rewrite.

## What gets built

### Auth & projects
- Google OAuth sign-in (Lovable-managed broker).
- `projects` table per user (name, created_at, mode = simple/advanced).
- `datasets` table (project_id, filename, row count, inferred schema JSON, quality score).
- `analyses` and `models` tables to cache results so revisits are instant.
- RLS scoped to `auth.uid()`; role table only if we later add team sharing.

### Ingestion
- Drag-drop upload for CSV / XLSX / JSON (50MB cap), parsed in-browser with PapaParse + SheetJS; raw file stored in Lovable Cloud Storage, parsed rows persisted as Parquet-like JSON in Postgres (or chunked rows table for >50k).
- Schema inference: numeric / categorical / datetime / text / ID, with heuristics on column names (`*_id`, `date`, `revenue`, `churn`, etc.).
- Editable preview table — user can override a column's type and mark the forecast target / label.

### Cleaning (reviewable, never silent)
- Missing-value report (% per column), duplicate detection, IQR + z-score outlier flags.
- Suggested actions as a checklist (impute mean/median/mode, drop col, drop rows); applied only on confirm, with a diff of what changed.
- Data Quality Score (0–100) from completeness, consistency, duplication, outlier rate.

### Data Analysis layer ("what happened & why")
- Descriptive stats per numeric column (simple-statistics).
- Time-series trend charts (day/week/month) with MoM/YoY deltas (date-fns + arquero for grouping).
- Segmentation: any metric × any categorical, as bar / stacked / donut (Recharts).
- Correlation matrix heatmap + plain-language callouts for strong pairs.
- Cohort + funnel detection: auto-triggered when `(user_id, date, event)` columns are present.
- Anomaly flagging on time series (rolling mean ± 3σ).
- LLM-generated narrative summary at the top of the dashboard, grounded in the actual computed numbers (no hallucinated stats — the prompt receives the stat JSON and is constrained to it).

### Data Science layer ("what will happen & how")
- Forecasting: Holt-Winters / simple exponential smoothing in TS, with 80/95% confidence bands and 7/30/90-day horizons. (Substitute for Prophet/ARIMA; works for the same use cases on business time series.)
- Predictive modeling, auto task selection by target dtype:
  - Classification: logistic regression + decision tree / random-forest (ml.js).
  - Regression: linear + random-forest regressor (ml.js).
  - Train/test split, surfaced metrics: accuracy/precision/recall/F1 or R²/RMSE/MAE, plus a plain-language quality rating.
- Feature importance (permutation importance for tree models; standardized coefficients for linear), explained in plain English.
- Clustering: k-means with automatic k selection via elbow, labeled by LLM (e.g. "high-value loyal").
- What-if simulator: sliders for top features, live re-scores the trained model and shows predicted outcome delta.
- Prescriptive recommendations: top 3–5 actions ranked by `|feature_importance × controllable_lever_range|`, LLM phrases them with impact + confidence tags.

### Dashboard & reporting
- Modular grid of chart cards (react-grid-layout), per-card PNG export and per-card CSV export.
- "Generate Report" → PDF (react-pdf) and shareable read-only link (signed URL).
- Saved Projects list; revisiting reuses cached analysis/model rows.
- Simple ↔ Advanced toggle persists on the project. Advanced mode exposes hyperparameters, lets the user re-run with a different algorithm, and exports a `.ipynb` + `.py` reproduction of the analysis (generated server-side as a static template that mirrors the JS pipeline using pandas/sklearn — runnable locally).

### UX direction
Neutral dark "instrument panel" base. Two distinct accents: one for **past/analysis** (e.g. cool teal), one for **future/predictions** (e.g. warm amber) — applied consistently to every analysis vs. forecast surface. Every chart has a one-sentence caption. Loading states explain the current step ("Detecting columns…", "Training model…"). Responsive down to tablet.

## Build order

Per your request, I'll plan all five phases. I'll still verify each phase end-to-end with a synthetic ~500-row sales CSV (date, region, plan, marketing_spend, signups, revenue, support_response_h, churned) before moving on — that's the only way "everything works" is real.

1. **Phase 1 — Skeleton.** Google auth, projects CRUD, upload + storage, schema detection, editable preview, cleaning checklist, quality score. Verify upload → preview → clean.
2. **Phase 2 — Analysis layer.** Stats, trend, segmentation, correlation, cohort/funnel auto-detect, anomalies, LLM narrative. Verify dashboard renders on sample CSV.
3. **Phase 3 — Science layer.** Forecasting, classification/regression auto-pick, metrics, feature importance, k-means, what-if simulator. Verify model trains and predicts on sample.
4. **Phase 4 — Recommendations + PDF report + dashboard customization + Simple/Advanced toggle + notebook export.**
5. **Phase 5 — Polish:** error states, empty states, responsive pass, seed demo dataset on first sign-in, performance pass on large files.

## Technical notes

- Stats/ML libs: `simple-statistics`, `arquero`, `ml-regression`, `ml-random-forest`, `ml-kmeans`, `papaparse`, `xlsx`, `date-fns`, `recharts`, `react-grid-layout`, `@react-pdf/renderer`.
- Heavy work (>2s) runs in a Web Worker so the UI stays responsive; model training results persist to Postgres so a refresh doesn't retrain.
- LLM narrative calls go through the Lovable AI Gateway (Gemini by default). The prompt is given the computed stats JSON and instructed to only describe those numbers — no free-form forecasting.
- Auth uses the integration-managed `_authenticated` layout (Google via Lovable broker). Server functions for all DB writes; RLS on every table.
- Project memory will record the dual-accent color rule and the "narrative is grounded in computed stats only" constraint so they survive future edits.

## Out of scope (vs. your original spec)

- Python/FastAPI backend, Celery/Redis, Docker compose — replaced by Lovable Cloud + TS workers.
- Prophet and XGBoost — replaced by Holt-Winters and ml.js random forest. Quality is good for SMB business data; not identical.
- Chunked upload >50MB — Phase 5+ if needed.
- Team/multi-user sharing — single-user projects for now; share via read-only report link.

Approve this and I'll start Phase 1.
