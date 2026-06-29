import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Briefcase, Users, TrendingUp, Sparkles, ArrowRight, Trash2 } from "lucide-react";
import { createJob, dashboardStats, deleteJob, listJobs } from "@/lib/jobs.functions";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Talentlens ATS" },
      { name: "description", content: "Overview of active job positions, candidates parsed, and AI-driven match scores." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const router = useRouter();
  const statsFn = useServerFn(dashboardStats);
  const listFn = useServerFn(listJobs);
  const createFn = useServerFn(createJob);
  const deleteFn = useServerFn(deleteJob);

  const stats = useQuery({ queryKey: ["stats"], queryFn: () => statsFn() });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => listFn() });

  const [desc, setDesc] = useState("");
  const [title, setTitle] = useState("");

  const create = useMutation({
    mutationFn: () => createFn({ data: { raw_description: desc, title: title || undefined } }),
    onSuccess: ({ id }) => {
      toast.success("Job parsed and saved");
      setDesc("");
      setTitle("");
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      router.navigate({ to: "/jobs/$jobId/upload", params: { jobId: id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Job deleted");
    },
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Recruiter dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">AI-powered screening across all your roles.</p>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Briefcase className="h-4 w-4" />} label="Active roles" value={stats.data?.jobs} loading={stats.isLoading} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Candidates parsed" value={stats.data?.candidates} loading={stats.isLoading} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Average match score" value={stats.data?.avgScore != null ? `${stats.data.avgScore}%` : "—"} loading={stats.isLoading} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Create a new job position</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste the job description. We'll extract required skills, qualifications, experience, and education automatically.
          </p>
          <div className="mt-4 space-y-3">
            <Input
              placeholder="Job title (optional — we'll infer it)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
            <Textarea
              placeholder="Paste the full job description here…"
              rows={10}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={20000}
            />
            <Button
              disabled={desc.trim().length < 20 || create.isPending}
              onClick={() => create.mutate()}
              className="w-full"
            >
              {create.isPending ? "Parsing with AI…" : "Save & extract criteria"}
            </Button>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold">Recent roles</h2>
          <div className="mt-4 space-y-3">
            {jobs.isLoading && (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            )}
            {!jobs.isLoading && (jobs.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No roles yet. Create your first job to get started.</p>
            )}
            {jobs.data?.map((j) => (
              <div key={j.id} className="group flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-accent/40">
                <Link to="/jobs/$jobId" params={{ jobId: j.id }} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{j.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(j.required_skills as string[]).slice(0, 4).map((s) => (
                      <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {s}
                      </span>
                    ))}
                  </div>
                </Link>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/jobs/$jobId" params={{ jobId: j.id }}>
                      Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Delete "${j.title}"?`)) remove.mutate(j.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string | undefined;
  loading: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">
        {loading ? <Skeleton className="h-8 w-16" /> : (value ?? 0)}
      </div>
    </Card>
  );
}
