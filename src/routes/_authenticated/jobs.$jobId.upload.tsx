import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { createCandidate, listCandidates, processCandidate } from "@/lib/candidates.functions";
import { getJob } from "@/lib/jobs.functions";

export const Route = createFileRoute("/_authenticated/jobs/$jobId/upload")({
  head: () => ({ meta: [{ title: "Upload resumes — Talentlens" }] }),
  component: UploadPage,
});

type Step = "uploading" | "extracting" | "parsing" | "scoring" | "complete" | "failed";
const STEPS: Step[] = ["uploading", "extracting", "parsing", "scoring", "complete"];
const STEP_LABEL: Record<Step, string> = {
  uploading: "Uploading to storage",
  extracting: "Extracting raw text",
  parsing: "AI information extraction",
  scoring: "Calculating semantic match",
  complete: "Complete",
  failed: "Failed",
};

type QueueItem = {
  localId: string;
  file: File;
  candidateId?: string;
  step: Step;
  error?: string;
};

function UploadPage() {
  const { jobId } = useParams({ from: "/_authenticated/jobs/$jobId/upload" });
  const qc = useQueryClient();
  const getJobFn = useServerFn(getJob);
  const createCandFn = useServerFn(createCandidate);
  const processFn = useServerFn(processCandidate);
  const listCandFn = useServerFn(listCandidates);

  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => getJobFn({ data: { id: jobId } }) });
  const existing = useQuery({ queryKey: ["candidates", jobId], queryFn: () => listCandFn({ data: { job_id: jobId } }) });

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const update = useCallback((localId: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((i) => (i.localId === localId ? { ...i, ...patch } : i)));
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      if (arr.length === 0) {
        toast.error("Only PDF files are supported");
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const items: QueueItem[] = arr.map((file) => ({ localId: crypto.randomUUID(), file, step: "uploading" }));
      setQueue((q) => [...items, ...q]);

      for (const item of items) {
        try {
          const path = `${u.user.id}/${jobId}/${Date.now()}-${item.file.name.replace(/[^a-z0-9._-]/gi, "_")}`;
          const up = await supabase.storage.from("resumes").upload(path, item.file, { upsert: false });
          if (up.error) throw up.error;
          update(item.localId, { step: "extracting" });
          const { id } = await createCandFn({ data: { job_id: jobId, file_path: path, file_name: item.file.name } });
          update(item.localId, { candidateId: id });
          // Walk through visual steps while server processes
          update(item.localId, { step: "parsing" });
          const result = await processFn({ data: { id } });
          if (!result.ok) {
            update(item.localId, { step: "failed", error: result.error });
          } else {
            update(item.localId, { step: "complete" });
          }
        } catch (e) {
          update(item.localId, { step: "failed", error: e instanceof Error ? e.message : String(e) });
        }
      }
      qc.invalidateQueries({ queryKey: ["candidates", jobId] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    [createCandFn, processFn, jobId, qc, update],
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/jobs/$jobId" params={{ jobId }} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to ranking
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Upload resumes</h1>
          <p className="text-sm text-muted-foreground">
            {job.data ? <>For role: <span className="font-medium text-foreground">{job.data.title}</span></> : "Loading…"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/jobs/$jobId" params={{ jobId }}>
            View ranking <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <Card
        className={`mt-6 border-2 border-dashed p-10 text-center transition ${
          dragOver ? "border-primary bg-accent/40" : "border-border"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">Drop PDF resumes here</p>
        <p className="text-sm text-muted-foreground">or click to browse — bulk upload supported</p>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="mt-4 block w-full cursor-pointer text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </Card>

      {queue.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground">Processing queue</h2>
          <div className="mt-3 space-y-3">
            {queue.map((it) => (
              <QueueRow key={it.localId} item={it} />
            ))}
          </div>
        </section>
      )}

      {(existing.data?.length ?? 0) > 0 && queue.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          {existing.data?.length} candidate(s) already parsed for this role.{" "}
          <Link to="/jobs/$jobId" params={{ jobId }} className="text-primary underline">
            View ranking
          </Link>
        </p>
      )}
    </main>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  const idx = item.step === "failed" ? STEPS.length : STEPS.indexOf(item.step);
  const pct = item.step === "complete" ? 100 : item.step === "failed" ? 100 : Math.max(8, (idx / (STEPS.length - 1)) * 100);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{item.file.name}</span>
        </div>
        <span className="text-xs text-muted-foreground">{(item.file.size / 1024).toFixed(0)} KB</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={pct} className="h-1.5 flex-1" />
        <span className="flex w-44 items-center justify-end gap-1.5 text-xs text-muted-foreground">
          {item.step === "complete" && <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--success)]" />}
          {item.step === "failed" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
          {STEP_LABEL[item.step]}
        </span>
      </div>
      {item.step === "failed" && item.error && (
        <p className="mt-2 text-xs text-destructive">{item.error}</p>
      )}
    </Card>
  );
}
