# InsightForge

Turn a spreadsheet into decisions and forecasts. Upload CSV/Excel business data and get:
- **Analysis layer** — descriptive stats, trends, segmentation, correlations, AI narrative summary
- **Data Science layer** — time-series forecasting, predictive modeling (auto-selected), customer clustering, what-if simulator, prescriptive recommendations
- **One-click PDF report** — shareable, non-technical summary

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, TanStack Start (SSR), Tailwind CSS v4 |
| Charts | Recharts |
| Data fetching | TanStack Query |
| Backend/Auth | Supabase (PostgreSQL + Storage + Auth) |
| ML (browser-native) | Custom implementations: Holt-Winters forecast, Logistic/Linear Regression, Random Forest, K-Means |
| PDF export | jsPDF |
| AI narrative | Google Gemini 2.5 Flash (via Lovable AI Gateway) |

---

## Prerequisites

- Node.js ≥ 20
- A Supabase project ([create one free](https://supabase.com))
- (Optional) Lovable API key for AI-generated narrative summaries

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd insight-compass-main
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase project → Settings → API → anon public key |
| `LOVABLE_API_KEY` | [Lovable dashboard](https://lovable.dev) → Settings → API Keys |

### 3. Run database migrations

In the Supabase dashboard, go to **SQL Editor** and run the migrations in `supabase/migrations/` in order (oldest timestamp first).

Or use the Supabase CLI:

```bash
npx supabase db push
```

### 4. Create a storage bucket

In the Supabase dashboard → Storage → New bucket:
- Name: `datasets`
- Public: **No** (private, authenticated only)
- Add the following RLS policy for the bucket (SQL editor):

```sql
CREATE POLICY "Users can manage own files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'datasets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

### 5. Start the dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

---

## Docker

```bash
docker compose up --build
```

App will be available at [http://localhost:3000](http://localhost:3000).

> **Note:** You still need a Supabase project. Update `.env` with your credentials before building.

---

## Using the App

1. **Sign up** with email/password or Google OAuth
2. **Create a project** — name it and optionally add a description
3. **Upload data** — drag-and-drop a CSV, XLSX, or JSON file (≤ 50 MB)
4. **Review schema** — InsightForge auto-detects column types; mark your date and target columns
5. **Apply cleaning** — approve suggested fixes (impute missing, drop duplicates, etc.)
6. **Open Analysis** → descriptive stats, trend charts, segments, correlations, AI narrative
7. **Open Data Science** → time-series forecast, predictive model, customer clusters, what-if simulator
8. **Export PDF** — one-click shareable report

---

## Sample Dataset

A 500-row synthetic sales dataset is included at `public/sample-sales-data.csv`:

| Column | Type | Description |
|---|---|---|
| `date` | datetime | Daily transaction date (Jan–Jun 2024) |
| `region` | categorical | North / South / East / West |
| `product` | categorical | Basic / Pro / Enterprise |
| `revenue` | numeric | Daily revenue in $ |
| `marketing_spend` | numeric | Daily marketing budget in $ |
| `signups` | numeric | New signups |
| `support_response_hours` | numeric | Avg support response time |
| `churned` | binary (0/1) | Whether the customer churned |

Use `support_response_hours` as an interesting predictor of `churned`.

---

## Project Structure

```
src/
├── components/insightforge/   # UI components
│   ├── AnalysisDashboard.tsx  # Phase 2 — Analysis layer
│   ├── ScienceDashboard.tsx   # Phase 3 — Data Science layer
│   ├── RecommendationsPanel.tsx
│   ├── FileUploader.tsx
│   ├── SchemaTable.tsx
│   ├── CleaningPanel.tsx
│   └── ...
├── lib/insightforge/
│   ├── analyze.ts             # Descriptive stats + trends + correlations
│   ├── infer.ts               # Schema inference
│   ├── quality.ts             # Data quality scoring + cleaning
│   ├── recommendations.ts     # Prescriptive recommendations engine
│   ├── pdfReport.ts           # PDF export (jsPDF)
│   └── ml/
│       ├── forecast.ts        # Holt-Winters time-series forecasting
│       ├── regression.ts      # Linear + Logistic regression
│       ├── randomForest.ts    # Random Forest classifier/regressor
│       ├── kmeans.ts          # K-Means clustering
│       └── automl.ts          # AutoML orchestrator
└── routes/
    └── _authenticated/
        ├── projects.tsx                     # Projects list
        ├── projects.$projectId.tsx          # Data prep + cleaning
        ├── projects.$projectId.analysis.tsx # Analysis dashboard
        └── projects.$projectId.science.tsx  # Data science dashboard
```
