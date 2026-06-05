import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import { playChime } from "../lib/chime";
import { needsInputRuns, diffCompletions, snapshotOf, type AttentionSnapshot } from "../lib/attention";
import { usePageLabel } from "./PageTitleProvider";
import { useToast } from "./Toast";
import type { AgentRun } from "../../shared/types";

const AttentionContext = createContext<{ needsInputCount: number }>({ needsInputCount: 0 });

export function useAttention(): { needsInputCount: number } {
  return useContext(AttentionContext);
}

/**
 * App-global "attention" layer: from the live runs list it tracks how many runs
 * currently need the user's input and fires one-shot toasts + chimes when a run
 * newly needs input or has just completed.
 */
export function AttentionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: runs = [], isSuccess } = useQuery({
    queryKey: ["runs"],
    queryFn: () => get<AgentRun[]>("/runs"),
  });

  const prevSnapshot = useRef<AttentionSnapshot | null>(null);
  const prevNeedsInput = useRef<Set<string>>(new Set());
  const baseTitle = useRef(document.title);
  const pageLabel = usePageLabel();

  useWsMessage((msg) => {
    if (msg.type === "run.updated") {
      void qc.invalidateQueries({ queryKey: ["runs"] });
    }
  });

  const needsInput = useMemo(() => needsInputRuns(runs), [runs]);
  const needsInputCount = needsInput.length;

  useEffect(() => {
    if (!isSuccess) return;
    // Seed baselines on the first successful load so pre-existing runs never toast.
    if (prevSnapshot.current === null) {
      prevSnapshot.current = snapshotOf(runs);
      prevNeedsInput.current = new Set(needsInput.map((run) => run.id));
      return;
    }

    let chime = false;

    for (const { runId, status } of diffCompletions(prevSnapshot.current, runs)) {
      const run = runs.find((candidate) => candidate.id === runId);
      toast({
        tone: status === "done" ? "good" : "bad",
        title: run?.title ?? "Agent run",
        body: status === "done" ? "completed" : "failed",
      });
      chime = true;
    }

    for (const run of needsInput) {
      if (!prevNeedsInput.current.has(run.id)) {
        toast({ tone: "warn", title: run.title, body: "waiting for your input" });
        chime = true;
      }
    }

    prevSnapshot.current = snapshotOf(runs);
    prevNeedsInput.current = new Set(needsInput.map((run) => run.id));
    if (chime) playChime();
  }, [runs, needsInput, isSuccess, toast]);

  useEffect(() => {
    const base = pageLabel ? `${baseTitle.current} – ${pageLabel}` : baseTitle.current;
    document.title = needsInputCount > 0 ? `(${needsInputCount}) ${base}` : base;
  }, [needsInputCount, pageLabel]);

  return <AttentionContext.Provider value={{ needsInputCount }}>{children}</AttentionContext.Provider>;
}
