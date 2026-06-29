import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Download,
  Upload,
  Mail,
  Phone,
  Sparkles,
  MessageSquare,
  Lightbulb,
  AlertCircle,
  Send,
  RefreshCw,
} from "lucide-react";
import { getJob } from "@/lib/jobs.functions";
import { getCandidate, listCandidates } from "@/lib/candidates.functions";
import { improvementTips, interviewQuestions, recruiterChat } from "@/lib/ai-helpers.functions";

export const Route = createFileRoute("/_authenticated/jobs/$jobId/")({
  head: () => ({ meta: [{ title: "Candidate ranking — Talentlens" }] }),
  component: JobRanking,
});

function JobRanking() {
  const { jobId } = useParams({ from: "/_authenticated/jobs/$jobId/" });
  const jobFn = useServerFn(getJob);
  const candFn = useServerFn(listCandidates);
  const candDetailFn = useServerFn(getCandidate);

  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => jobFn({ data: { id: jobId } }) });
  const list = useQuery({
    queryKey: ["candidates", jobId],
    queryFn: () => candFn({ data: { job_id: jobId } }),
    refetchInterval: (q) => {
      const rows = q.state.data ?? [];
      return rows.some((r) => r.status !== "complete" && r.status !== "failed") ? 3000 : false;
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && list.data?.length) {
      const firstComplete = list.data.find((c) => c.status === "complete") ?? list.data[0];
      setSelectedId(firstComplete.id);
    }
  }, [list.data, selectedId]);

  const detail = useQuery({
    queryKey: ["candidate", selectedId],
    queryFn: () => candDetailFn({ data: { id: selectedId! } }),
    enabled: !!selectedId,
  });

  function exportCsv() {
    const rows = (list.data ?? []).map((c) => ({
      name: c.name ?? "",
      email: c.email ?? "",
      match_score: c.match_score ?? "",
      skills: (c.skills ?? []).join("; "),
      status: c.status,
      file_name: c.file_name,
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.data?.title ?? "candidates"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Dashboard
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold">{job.data?.title ?? "Loading…"}</h1>
          <div className="mt-1 flex flex-wrap gap-1">
            {job.data?.required_skills.slice(0, 8).map((s) => (
              <span key={s} className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!list.data?.length}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
          <Button asChild>
            <Link to="/jobs/$jobId/upload" params={{ jobId }}>
              <Upload className="mr-1.5 h-4 w-4" /> Upload resumes
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* LEFT: ranked list */}
        <Card className="overflow-hidden">
          <div className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ranked shortlist ({list.data?.length ?? 0})
          </div>
          <ScrollArea className="h-[calc(100vh-220px)]">
            <ul className="divide-y">
              {list.isLoading && (
                <>
                  {[...Array(5)].map((_, i) => (
                    <li key={i} className="p-4">
                      <Skeleton className="h-5 w-1/2" />
                      <Skeleton className="mt-2 h-3 w-1/3" />
                    </li>
                  ))}
                </>
              )}
              {!list.isLoading && (list.data?.length ?? 0) === 0 && (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  No candidates yet.{" "}
                  <Link to="/jobs/$jobId/upload" params={{ jobId }} className="text-primary underline">
                    Upload resumes
                  </Link>
                </li>
              )}
              {list.data?.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full px-4 py-3 text-left transition hover:bg-accent/40 ${
                      selectedId === c.id ? "bg-accent/60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.name ?? c.file_name}</div>
                        <div className="truncate text-xs text-muted-foreground">{c.email ?? "—"}</div>
                      </div>
                      {c.status === "complete" ? (
                        <ScoreBadge score={c.match_score as number | null} />
                      ) : c.status === "failed" ? (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                          failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          <RefreshCw className="h-3 w-3 animate-spin" /> {c.status}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(c.skills ?? []).slice(0, 4).map((s) => (
                        <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {s}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </Card>

        {/* RIGHT: detail */}
        <div className="space-y-4">
          {!selectedId && (
            <Card className="p-12 text-center text-sm text-muted-foreground">
              Select a candidate to view their AI assessment.
            </Card>
          )}
          {selectedId && detail.isLoading && (
            <Card className="space-y-3 p-6">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-32 w-full" />
            </Card>
          )}
          {selectedId && detail.data && <CandidateDetail key={selectedId} candidate={detail.data} job={job.data} />}
        </div>
      </div>
    </main>
  );
}

type CandidateRow = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getCandidate>>>>;
type JobRow = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getJob>>>>;

function CandidateDetail({ candidate, job }: { candidate: CandidateRow; job: JobRow | undefined }) {
  if (candidate.status === "failed") {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
          <div>
            <h3 className="font-semibold">Could not process this resume</h3>
            <p className="mt-1 text-sm text-muted-foreground">{candidate.error_text ?? "Unknown error"}</p>
          </div>
        </div>
      </Card>
    );
  }
  if (candidate.status !== "complete") {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Processing — current step: {candidate.status}
        </div>
        <Skeleton className="mt-4 h-32 w-full" />
      </Card>
    );
  }

  const breakdown = (candidate.score_breakdown ?? {}) as {
    skill_match?: number;
    experience_match?: number;
    semantic_similarity?: number;
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{candidate.name ?? candidate.file_name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {candidate.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {candidate.email}
                  </span>
                )}
                {candidate.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {candidate.phone}
                  </span>
                )}
                {candidate.experience_years != null && (
                  <span>{Number(candidate.experience_years)} yrs experience</span>
                )}
              </div>
            </div>
            <ScoreBadge score={candidate.match_score as number | null} className="text-base px-3 py-1" />
          </div>

          {candidate.summary && (
            <div className="mt-4 rounded-lg border-l-2 border-primary bg-accent/40 p-3 text-sm">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">Executive summary</div>
              {candidate.summary}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-semibold">Explainable score breakdown</h3>
          <div className="mt-4 space-y-3">
            <ScoreBar label="Skill match" value={breakdown.skill_match ?? 0} weight={50} />
            <ScoreBar label="Experience fit" value={breakdown.experience_match ?? 0} weight={20} />
            <ScoreBar label="Semantic profile similarity" value={breakdown.semantic_similarity ?? 0} weight={30} />
          </div>
        </Card>

        <Card className="grid gap-4 p-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--success)]">Strengths</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {(candidate.strengths ?? []).map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[color:var(--success)]">+</span>
                  <span>{s}</span>
                </li>
              ))}
              {!candidate.strengths?.length && <li className="text-muted-foreground">—</li>}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-destructive">Gaps</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {(candidate.weaknesses ?? []).map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-destructive">−</span>
                  <span>{s}</span>
                </li>
              ))}
              {!candidate.weaknesses?.length && <li className="text-muted-foreground">—</li>}
            </ul>
          </div>
        </Card>

        <Card className="p-6">
          <Tabs defaultValue="experience">
            <TabsList>
              <TabsTrigger value="experience">Experience</TabsTrigger>
              <TabsTrigger value="education">Education</TabsTrigger>
              <TabsTrigger value="certs">Certifications</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="skills">Skills</TabsTrigger>
            </TabsList>
            <TabsContent value="experience" className="mt-4 space-y-3">
              {((candidate.work_experience as Array<{ title?: string; company?: string; start?: string; end?: string; summary?: string }>) ?? []).map((w, i) => (
                <div key={i} className="border-l-2 border-border pl-3">
                  <div className="font-medium">
                    {w.title ?? "Role"} <span className="text-muted-foreground">· {w.company ?? "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {w.start ?? "?"} — {w.end ?? "Present"}
                  </div>
                  {w.summary && <p className="mt-1 text-sm text-muted-foreground">{w.summary}</p>}
                </div>
              ))}
            </TabsContent>
            <TabsContent value="education" className="mt-4 space-y-2 text-sm">
              {((candidate.education as Array<{ degree?: string; institution?: string; year?: string }>) ?? []).map((e, i) => (
                <div key={i}>
                  <span className="font-medium">{e.degree ?? "—"}</span> · {e.institution ?? "—"}{" "}
                  <span className="text-muted-foreground">{e.year ?? ""}</span>
                </div>
              ))}
            </TabsContent>
            <TabsContent value="certs" className="mt-4 space-y-1 text-sm">
              {((candidate.certifications as string[]) ?? []).map((c, i) => (
                <div key={i}>• {c}</div>
              ))}
            </TabsContent>
            <TabsContent value="projects" className="mt-4 space-y-3 text-sm">
              {((candidate.projects as Array<{ name?: string; description?: string }>) ?? []).map((p, i) => (
                <div key={i}>
                  <div className="font-medium">{p.name ?? "Project"}</div>
                  {p.description && <p className="text-muted-foreground">{p.description}</p>}
                </div>
              ))}
            </TabsContent>
            <TabsContent value="skills" className="mt-4 flex flex-wrap gap-1.5">
              {(candidate.skills ?? []).map((s) => (
                <span key={s} className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  {s}
                </span>
              ))}
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <SidePanel candidate={candidate} job={job} />
    </div>
  );
}

function ScoreBar({ label, value, weight }: { label: string; value: number; weight: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {Math.round(value)} <span className="text-[10px]">· weight {weight}%</span>
        </span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  );
}

function SidePanel({ candidate, job }: { candidate: CandidateRow; job: JobRow | undefined }) {
  const requiredMissing = useMemo(() => {
    const skills = new Set((candidate.skills ?? []).map((s) => s.toLowerCase()));
    return (job?.required_skills ?? []).map((s) => ({
      skill: s,
      have: Array.from(skills).some((c) => c.includes(s.toLowerCase()) || s.toLowerCase().includes(c)),
    }));
  }, [candidate.skills, job?.required_skills]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Interview questions
        </div>
        <InterviewQuestions candidateId={candidate.id} />
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold">Skill gap checklist</div>
        <ul className="mt-2 space-y-1.5 text-sm">
          {requiredMissing.map((r) => (
            <li key={r.skill} className="flex items-center gap-2">
              <span
                className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${
                  r.have
                    ? "border-[color:var(--success)] bg-[color:var(--success)]/15 text-[color:var(--success)]"
                    : "border-destructive bg-destructive/10 text-destructive"
                }`}
              >
                {r.have ? "✓" : "✕"}
              </span>
              <span className={r.have ? "" : "text-destructive"}>{r.skill}</span>
            </li>
          ))}
          {!requiredMissing.length && <li className="text-muted-foreground">No required skills set.</li>}
        </ul>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Lightbulb className="h-3.5 w-3.5 text-[color:var(--warning)]" /> Resume improvement tips
        </div>
        <ImprovementTips candidateId={candidate.id} />
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="h-3.5 w-3.5 text-primary" /> Ask about this candidate pool
        </div>
        <RecruiterChat jobId={candidate.job_id} />
      </Card>
    </div>
  );
}

function InterviewQuestions({ candidateId }: { candidateId: string }) {
  const fn = useServerFn(interviewQuestions);
  const m = useMutation({
    mutationFn: () => fn({ data: { candidate_id: candidateId } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <div className="mt-2">
      <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending ? "Generating…" : m.data ? "Regenerate" : "Generate questions"}
      </Button>
      {m.data && (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          {m.data.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ImprovementTips({ candidateId }: { candidateId: string }) {
  const fn = useServerFn(improvementTips);
  const m = useMutation({
    mutationFn: () => fn({ data: { candidate_id: candidateId } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <div className="mt-2">
      <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending ? "Thinking…" : m.data ? "Regenerate" : "Generate tips"}
      </Button>
      {m.data && (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
          {m.data.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecruiterChat({ jobId }: { jobId: string }) {
  const fn = useServerFn(recruiterChat);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [pending, setPending] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const { reply } = await fn({ data: { job_id: jobId, messages: next } });
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed");
      setMessages(next);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="max-h-56 space-y-2 overflow-y-auto text-sm">
        {messages.length === 0 && (
          <p className="text-muted-foreground">
            Try: "Who has team leadership experience?" or "Rank top 3 by React + AWS."
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-md p-2 ${m.role === "user" ? "bg-accent/60" : "bg-muted"}`}
          >
            <div className="mb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{m.role}</div>
            {m.content}
          </div>
        ))}
        {pending && <div className="text-xs text-muted-foreground">Thinking…</div>}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask…"
          disabled={pending}
        />
        <Button size="icon" onClick={send} disabled={pending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
