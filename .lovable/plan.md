# AI-Powered Resume Screening & Ranking System

A recruiter ATS with job-description intake, bulk PDF resume parsing, AI extraction, semantic matching, ranked shortlist, and explainable scoring — built on Lovable Cloud + Lovable AI.

## Stack decisions
- **Frontend:** TanStack Start (project default), Tailwind v4, shadcn/ui, Lucide.
- **Backend:** Lovable Cloud (Postgres + Auth + Storage + `pgvector` for embeddings).
- **AI:** Lovable AI Gateway via server functions — `google/gemini-3-flash-preview` for extraction/scoring/chat, `google/gemini-embedding-001` for semantic similarity. (Note: spec mentions OpenAI/Claude — Lovable AI is the supported gateway; I'll surface this and use Gemini unless you ask otherwise.)
- **PDF parsing:** `unpdf` (Worker-compatible) in a server function.

## Data model (migrations)
- `profiles` (id → auth.users, full_name, email)
- `jobs` (id, user_id, title, raw_description, required_skills[], preferred_qualifications[], required_experience_years, education_requirements[], embedding vector(768), created_at)
- `candidates` (id, job_id, user_id, file_path, file_name, status enum[uploading,extracting,parsing,scoring,complete,failed], error_text, name, email, phone, skills[], experience_years, education jsonb, certifications jsonb, projects jsonb, work_experience jsonb, raw_text, embedding vector(768), match_score numeric, score_breakdown jsonb, strengths[], weaknesses[], missing_skills[], summary text, created_at)
- RLS: owner-scoped on all tables via `user_id`. Storage bucket `resumes` (private) with per-user folder policies.

## Server functions (src/lib/*.functions.ts)
- `createJob` → call Lovable AI to extract structured criteria + embedding; insert row.
- `updateJobCriteria` → save edited tags.
- `uploadResume` → returns signed upload URL; client uploads to storage.
- `processResume(candidateId)` → pipeline: download PDF → unpdf text → LLM JSON extraction → embedding → score (skills overlap + experience fit + cosine similarity) → strengths/weaknesses/summary/missing skills → update row. Status updates after each step.
- `generateInterviewQuestions(candidateId)`
- `generateImprovementTips(candidateId)`
- `recruiterChat(jobId, messages)` — answers natural-language questions over the candidate set for a job (passes compact candidate JSON as context).
- `exportCandidatesCsv(jobId)` (client-side CSV is fine too).

## Routes
- `/auth` — sign in / sign up (email + password).
- `/_authenticated/` layout (managed).
  - `/` — Dashboard: stats (active jobs, candidates parsed, avg score), recent jobs, "Create New Job" textarea → extracted criteria tags (editable).
  - `/jobs/$jobId/upload` — Drag-drop multi-PDF uploader, live per-file status pipeline.
  - `/jobs/$jobId` — Split view:
    - Left: ranked candidates table (name, email, skills tags, color-coded score badge), Export CSV.
    - Right: selected candidate card with tabs (Contact / Experience / Education / Certifications / Projects), Strengths vs Weaknesses, Explainable Score Breakdown (skill/experience/semantic weights with bars), Executive Summary, and a side panel for: Interview Questions, Skill Gap checklist, Recruiter Chat, Improvement Suggestions.

## Scoring formula (explainable)
`score = 0.5 * skillMatch + 0.2 * experienceFit + 0.3 * semanticSimilarity` — each component stored in `score_breakdown` for UI display. Color: ≥75 green, 50–74 yellow, <50 red.

## UX
- Skeletons on tables and assessment card during loads.
- Toast errors for failed PDFs (encrypted/corrupted) with status = failed surfaced in the queue.
- React Query for caching; polling on processing rows until `complete`/`failed`.

## Out of scope (call out)
- No external OpenAI/Claude keys — uses Lovable AI Gateway.
- No team/multi-recruiter sharing in v1 (each recruiter sees own jobs).

## Build order
1. Enable Lovable Cloud, install deps (`unpdf`, `papaparse`).
2. Migrations + storage bucket + RLS.
3. Design system tweaks in `src/styles.css` (clean recruiter aesthetic, no purple).
4. Auth route + `_authenticated` layout.
5. Server functions (job + resume pipeline + AI helpers).
6. Dashboard → Upload → Ranking pages.
7. Bonus side panel features.
8. Polish: skeletons, error states, CSV export.

Confirm and I'll build it. If you'd prefer OpenAI/Claude with your own API keys instead of Lovable AI, say so before I start.