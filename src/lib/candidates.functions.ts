import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateCandidateInput = z.object({
  job_id: z.string().uuid(),
  file_path: z.string().min(1).max(500),
  file_name: z.string().min(1).max(300),
});

export const createCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateCandidateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("candidates")
      .insert({
        job_id: data.job_id,
        user_id: context.userId,
        file_path: data.file_path,
        file_name: data.file_name,
        status: "extracting",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("candidates")
      .select(
        "id,job_id,file_name,status,error_text,name,email,skills,match_score,created_at",
      )
      .eq("job_id", data.job_id)
      .order("match_score", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("candidates")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("candidates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type ExtractedResume = {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience_years: number;
  education: Array<{ degree?: string; institution?: string; year?: string }>;
  certifications: string[];
  projects: Array<{ name?: string; description?: string }>;
  work_experience: Array<{ title?: string; company?: string; start?: string; end?: string; summary?: string }>;
};

type Assessment = {
  strengths: string[];
  weaknesses: string[];
  missing_skills: string[];
  summary: string;
};

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9+# ]/g, " ").replace(/\s+/g, " ").trim();
}

function skillOverlap(jobSkills: string[], candidateSkills: string[]): number {
  if (!jobSkills.length) return 1;
  const cset = new Set(candidateSkills.map(normalize));
  let hits = 0;
  for (const s of jobSkills) {
    const ns = normalize(s);
    for (const c of cset) {
      if (c === ns || c.includes(ns) || ns.includes(c)) {
        hits++;
        break;
      }
    }
  }
  return hits / jobSkills.length;
}

function experienceFit(required: number, actual: number | null | undefined): number {
  if (!required || required <= 0) return 1;
  const a = Number(actual) || 0;
  if (a >= required) return 1;
  return Math.max(0, a / required);
}

export const processCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: cand, error: cErr } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", data.id)
      .single();
    if (cErr || !cand) throw new Error(cErr?.message ?? "Candidate not found");
    const { data: job, error: jErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", cand.job_id)
      .single();
    if (jErr || !job) throw new Error(jErr?.message ?? "Job not found");

    try {
      // Download file
      await supabase.from("candidates").update({ status: "extracting" }).eq("id", cand.id);
      const dl = await supabase.storage.from("resumes").download(cand.file_path);
      if (dl.error || !dl.data) throw new Error(`Storage: ${dl.error?.message ?? "no file"}`);
      const buf = new Uint8Array(await dl.data.arrayBuffer());

      // Extract text
      const { extractText, getDocumentProxy } = await import("unpdf");
      let rawText = "";
      try {
        const pdf = await getDocumentProxy(buf);
        const { text } = await extractText(pdf, { mergePages: true });
        rawText = Array.isArray(text) ? text.join("\n") : text;
      } catch (e) {
        throw new Error("PDF could not be read (encrypted or corrupted)");
      }
      if (!rawText || rawText.trim().length < 30) {
        throw new Error("Resume contains no extractable text (likely a scanned image)");
      }

      // LLM extraction
      await supabase.from("candidates").update({ status: "parsing", raw_text: rawText.slice(0, 50000) }).eq("id", cand.id);
      const { chatJson, embed, cosine } = await import("@/lib/ai.server");
      const extracted = await chatJson<ExtractedResume>({
        system:
          "You parse a raw resume into structured JSON. Use null for unknown contact fields. experience_years is the total professional years (number). Return ONLY JSON with keys: name, email, phone, skills (string[]), experience_years (number), education (array of {degree, institution, year}), certifications (string[]), projects (array of {name, description}), work_experience (array of {title, company, start, end, summary}).",
        prompt: rawText.slice(0, 18000),
      });

      // Scoring
      await supabase.from("candidates").update({ status: "scoring" }).eq("id", cand.id);
      const candEmbedding = await embed(rawText.slice(0, 8000));
      const semantic =
        job.embedding && Array.isArray(job.embedding)
          ? Math.max(0, cosine(candEmbedding, job.embedding as unknown as number[]))
          : 0.5;
      const skill = skillOverlap(job.required_skills ?? [], extracted.skills ?? []);
      const exp = experienceFit(job.required_experience_years ?? 0, extracted.experience_years);
      const breakdown = {
        skill_match: Math.round(skill * 100),
        experience_match: Math.round(exp * 100),
        semantic_similarity: Math.round(semantic * 100),
        weights: { skill_match: 0.5, experience_match: 0.2, semantic_similarity: 0.3 },
      };
      const score = Math.round((0.5 * skill + 0.2 * exp + 0.3 * semantic) * 100);

      // Assessment
      const assessment = await chatJson<Assessment>({
        system:
          "You are an expert recruiter. Compare the candidate to the job and return JSON with keys: strengths (string[], up to 5), weaknesses (string[], up to 5), missing_skills (string[] of required skills not present in candidate's skills), summary (3 sentences explaining fit and interview recommendation).",
        prompt: JSON.stringify({
          job: {
            title: job.title,
            required_skills: job.required_skills,
            preferred_qualifications: job.preferred_qualifications,
            required_experience_years: job.required_experience_years,
            education_requirements: job.education_requirements,
          },
          candidate: extracted,
          score_breakdown: breakdown,
        }).slice(0, 16000),
      });

      await supabase
        .from("candidates")
        .update({
          status: "complete",
          name: extracted.name,
          email: extracted.email,
          phone: extracted.phone,
          skills: extracted.skills ?? [],
          experience_years: extracted.experience_years ?? null,
          education: extracted.education ?? [],
          certifications: extracted.certifications ?? [],
          projects: extracted.projects ?? [],
          work_experience: extracted.work_experience ?? [],
          embedding: candEmbedding as unknown as string,
          match_score: score,
          score_breakdown: breakdown,
          strengths: assessment.strengths ?? [],
          weaknesses: assessment.weaknesses ?? [],
          missing_skills: assessment.missing_skills ?? [],
          summary: assessment.summary ?? null,
          error_text: null,
        })
        .eq("id", cand.id);

      return { ok: true, score };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("candidates").update({ status: "failed", error_text: msg }).eq("id", cand.id);
      return { ok: false, error: msg };
    }
  });
