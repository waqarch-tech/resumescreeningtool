import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateJobInput = z.object({
  raw_description: z.string().trim().min(20).max(20000),
  title: z.string().trim().min(1).max(200).optional(),
});

const UpdateJobInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  required_skills: z.array(z.string()).max(100),
  preferred_qualifications: z.array(z.string()).max(100),
  required_experience_years: z.number().min(0).max(50),
  education_requirements: z.array(z.string()).max(50),
});

export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateJobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { chatJson, embed } = await import("@/lib/ai.server");
    type Parsed = {
      title: string;
      required_skills: string[];
      preferred_qualifications: string[];
      required_experience_years: number;
      education_requirements: string[];
    };
    const parsed = await chatJson<Parsed>({
      system:
        "Extract structured hiring criteria from a job description for an ATS. Return strict JSON with keys: title (string, infer a short role title), required_skills (string[]), preferred_qualifications (string[]), required_experience_years (number, 0 if unspecified), education_requirements (string[]).",
      prompt: `Job description:\n${data.raw_description}`,
    });
    const embedding = await embed(data.raw_description);

    const row = {
      user_id: context.userId,
      title: data.title || parsed.title || "Untitled Role",
      raw_description: data.raw_description,
      required_skills: parsed.required_skills ?? [],
      preferred_qualifications: parsed.preferred_qualifications ?? [],
      required_experience_years: Number(parsed.required_experience_years) || 0,
      education_requirements: parsed.education_requirements ?? [],
      embedding: embedding as unknown as string,
    };
    const { data: inserted, error } = await context.supabase
      .from("jobs")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const updateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateJobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("jobs")
      .update({
        title: data.title,
        required_skills: data.required_skills,
        preferred_qualifications: data.preferred_qualifications,
        required_experience_years: data.required_experience_years,
        education_requirements: data.education_requirements,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("jobs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("jobs")
      .select("id,title,required_skills,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [jobsRes, candidatesRes, avgRes] = await Promise.all([
      context.supabase.from("jobs").select("id", { count: "exact", head: true }),
      context.supabase.from("candidates").select("id", { count: "exact", head: true }).eq("status", "complete"),
      context.supabase.from("candidates").select("match_score").eq("status", "complete"),
    ]);
    const scores = (avgRes.data ?? []).map((r) => Number(r.match_score)).filter((n) => !isNaN(n));
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return {
      jobs: jobsRes.count ?? 0,
      candidates: candidatesRes.count ?? 0,
      avgScore: avg,
    };
  });
