import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const interviewQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ candidate_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cand } = await context.supabase.from("candidates").select("*").eq("id", data.candidate_id).single();
    if (!cand) throw new Error("Not found");
    const { data: job } = await context.supabase.from("jobs").select("*").eq("id", cand.job_id).single();
    const { chatJson } = await import("@/lib/ai.server");
    const out = await chatJson<{ questions: string[] }>({
      system:
        "Generate exactly 3 targeted interview questions for this candidate. Each question must probe a real gap, weakness, or unique project relative to the role. Return JSON: { questions: [string, string, string] }.",
      prompt: JSON.stringify({ job, candidate: cand }).slice(0, 14000),
    });
    return out.questions ?? [];
  });

export const improvementTips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ candidate_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cand } = await context.supabase.from("candidates").select("*").eq("id", data.candidate_id).single();
    if (!cand) throw new Error("Not found");
    const { data: job } = await context.supabase.from("jobs").select("*").eq("id", cand.job_id).single();
    const { chatJson } = await import("@/lib/ai.server");
    const out = await chatJson<{ tips: string[] }>({
      system:
        "Return 4-6 concrete, constructive resume-improvement tips a recruiter could share with the candidate to better align with this role. Return JSON: { tips: string[] }.",
      prompt: JSON.stringify({ job, candidate: cand }).slice(0, 14000),
    });
    return out.tips ?? [];
  });

export const recruiterChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        job_id: z.string().uuid(),
        messages: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
          .min(1)
          .max(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("jobs").select("*").eq("id", data.job_id).single();
    const { data: cands } = await context.supabase
      .from("candidates")
      .select("name,email,skills,experience_years,match_score,strengths,weaknesses,summary,work_experience")
      .eq("job_id", data.job_id)
      .eq("status", "complete")
      .order("match_score", { ascending: false })
      .limit(50);
    const { chat } = await import("@/lib/ai.server");
    const reply = await chat({
      messages: [
        {
          role: "system",
          content: `You are a recruiting assistant. Answer the recruiter's questions concisely using only this candidate pool. If unknown, say so. Job: ${JSON.stringify(job).slice(0, 4000)}\nCandidates: ${JSON.stringify(cands).slice(0, 12000)}`,
        },
        ...data.messages,
      ],
    });
    return { reply };
  });
