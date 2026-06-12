"use client";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedExpand, useEntrance } from "@/components/ui/animated-list";
import type { CoordinationSummary } from "../coordinationCounts";
import { summarizeAuthors, type ClashIssue } from "../coordinationClash";
import type { ProjectCoverage } from "@/lib/server/projectCoverageView";
import { officeCodeFor, officeLabel } from "../projectGroups";
import { formatRelativeTime, formatAbsolute } from "../relativeTime";
import { OfficeBadge, CoverageChips, FullyCoveredBadge } from "./CoverageBadges";

/** Author name — a profile link when we have an email + a click handler, else plain text. */
function AuthorName({
  name,
  email,
  onAuthorClick,
  className = "",
}: {
  name: string;
  email: string | null;
  onAuthorClick?: (email: string) => void;
  className?: string;
}) {
  if (email && onAuthorClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAuthorClick(email);
        }}
        title={`View ${name}'s profile`}
        className={`font-medium text-primary underline-offset-2 hover:underline ${className}`}
      >
        {name}
      </button>
    );
  }
  return <span className={`font-medium text-foreground/80 ${className}`}>{name}</span>;
}

/** "Top authors" summary for an expanded project — who is driving its issues. */
function TopAuthors({
  clashes,
  onAuthorClick,
}: {
  clashes: ClashIssue[];
  onAuthorClick?: (email: string) => void;
}) {
  const authors = summarizeAuthors(clashes).slice(0, 8);
  if (authors.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Top authors</span>
      {authors.map((a) => {
        const clickable = !!(a.email && onAuthorClick);
        return (
          <button
            key={a.email ?? a.name}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onAuthorClick!(a.email!)}
            title={clickable ? `View ${a.name}'s profile` : a.name}
            className={`inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] transition ${
              clickable ? "hover:border-primary/50 hover:bg-primary/10" : "cursor-default"
            }`}
          >
            <span className={`max-w-[10rem] truncate ${clickable ? "text-primary" : "text-foreground/80"}`}>{a.name}</span>
            <span className="rounded-full bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">{a.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Status → pill style. Open issues are the actionable ones (amber); resolved are green. */
function statusStyle(status: string): string {
  const s = status.toLowerCase();
  if (s === "open") return "bg-warning/15 text-warning";
  if (s === "closed" || s === "completed" || s === "resolved") return "bg-success/15 text-success";
  if (s === "in_review") return "bg-primary/15 text-primary";
  return "bg-muted text-muted-foreground";
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Thin open/closed proportion bar for a project. */
function OpenClosedBar({ open, closed }: { open: number; closed: number }) {
  const total = open + closed || 1;
  return (
    <span className="inline-flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted" title={`${open} open · ${closed} closed`}>
      <span className="h-full bg-warning" style={{ width: `${(open / total) * 100}%` }} />
      <span className="h-full bg-success" style={{ width: `${(closed / total) * 100}%` }} />
    </span>
  );
}

function ClashCard({
  c,
  index,
  onAuthorClick,
}: {
  c: ClashIssue;
  index: number;
  onAuthorClick?: (email: string) => void;
}) {
  const entrance = useEntrance();
  return (
    <motion.li {...entrance(index)} className="rounded-lg border border-border bg-card/60 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {c.displayId != null && (
            <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] font-medium tabular-nums text-muted-foreground">#{c.displayId}</span>
          )}
          <span className="truncate text-xs font-medium text-foreground" title={c.title}>{c.title}</span>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-medium ${statusStyle(c.status)}`}>{c.status}</span>
      </div>
      {c.author && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
          by <AuthorName name={c.author} email={c.authorEmail} onAuthorClick={onAuthorClick} />
        </p>
      )}
      {c.description && (
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-[11px] leading-relaxed text-muted-foreground">{c.description}</p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        {c.validated && (
          <span className="inline-flex items-center gap-0.5 rounded bg-success/15 px-1 py-px font-medium text-success" title="Confirmed against the clash endpoint">
            ✓ Clash-verified
          </span>
        )}
        {c.confidence && <span className="rounded bg-muted px-1 py-px">{c.confidence} confidence</span>}
        {c.source && <span className="rounded bg-muted px-1 py-px" title="How this issue was classified as coordination">via {c.source}</span>}
        {(c.commentCount ?? 0) > 0 && <span title="Comments">💬 {c.commentCount}</span>}
        {(c.attachmentCount ?? 0) > 0 && <span title="Attachments">📎 {c.attachmentCount}</span>}
        {c.createdAt && <span className="ml-auto" title={formatAbsolute(c.createdAt)}>{formatRelativeTime(c.createdAt)}</span>}
      </div>
    </motion.li>
  );
}

export function CoordinationByProject({
  summary,
  accessibleProjects,
  forbiddenProjects,
  latestRunAt,
  coverage,
  mtyIds,
  loadClashes,
  onAuthorClick,
}: {
  summary: CoordinationSummary;
  accessibleProjects: number;
  forbiddenProjects: number;
  latestRunAt?: string | null;
  coverage?: Map<string, ProjectCoverage>;
  mtyIds?: Set<string>;
  loadClashes?: (projectId: string) => Promise<ClashIssue[]>;
  onAuthorClick?: (email: string) => void;
}) {
  const { total, byProject, byStatus } = summary;
  const max = byProject[0]?.count ?? 1;
  const reduce = useReducedMotion();

  const [openId, setOpenId] = useState<string | null>(null);
  const [clashes, setClashes] = useState<Map<string, ClashIssue[]>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [erroredIds, setErroredIds] = useState<Set<string>>(new Set());

  async function expand(projectId: string) {
    if (openId === projectId) {
      setOpenId(null);
      return;
    }
    setOpenId(projectId);
    if (clashes.has(projectId) || !loadClashes) return;
    setLoadingIds((s) => new Set(s).add(projectId));
    setErroredIds((s) => {
      const n = new Set(s);
      n.delete(projectId);
      return n;
    });
    try {
      const list = await loadClashes(projectId);
      setClashes((m) => new Map(m).set(projectId, list));
    } catch {
      setErroredIds((s) => new Set(s).add(projectId));
    } finally {
      setLoadingIds((s) => {
        const n = new Set(s);
        n.delete(projectId);
        return n;
      });
    }
  }

  const openTotal = byProject.reduce((a, p) => a + p.open, 0);
  const closedTotal = byProject.reduce((a, p) => a + p.closed, 0);

  return (
    <div className="ui-paper p-5">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{total.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">coordination issues</span>
        </div>
        {latestRunAt && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground"
            title={`Latest issue extraction: ${formatAbsolute(latestRunAt)}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_currentColor]" aria-hidden />
            Extracted {formatRelativeTime(latestRunAt)}
          </span>
        )}
      </header>

      {total > 0 && (
        <div className="mb-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" title={`${openTotal} open · ${closedTotal} closed`}>
            <span className="h-full bg-warning" style={{ width: `${(openTotal / total) * 100}%` }} />
            <span className="h-full bg-success" style={{ width: `${(closedTotal / total) * 100}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
            {byStatus.map((s) => (
              <span key={s.status} className={`rounded-md px-2 py-0.5 ${statusStyle(s.status)}`}>
                {s.status}: <span className="font-semibold tabular-nums">{s.count.toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {byProject.length === 0 ? (
        <p className="text-sm text-muted-foreground">No coordination issues in the selected projects.</p>
      ) : (
        <ul className="list-none space-y-1">
          {byProject.map((p) => {
            const pct = max > 0 ? (p.count / max) * 100 : 0;
            const code = officeCodeFor({ id: p.projectId, name: p.projectName }, mtyIds);
            const cov = coverage?.get(p.projectId);
            const isOpen = openId === p.projectId;
            const expandable = !!loadClashes;
            const list = clashes.get(p.projectId);
            return (
              <li key={p.projectId} className="overflow-hidden rounded-lg border border-transparent hover:border-border">
                <button
                  type="button"
                  onClick={() => expandable && expand(p.projectId)}
                  aria-expanded={isOpen}
                  className={`relative flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${expandable ? "cursor-pointer" : "cursor-default"}`}
                >
                  <motion.span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  />
                  {expandable && (
                    <span className="relative shrink-0 text-muted-foreground"><IconChevron open={isOpen} /></span>
                  )}
                  <span className="relative shrink-0"><OfficeBadge code={code} label={officeLabel(code)} /></span>
                  <span className="relative flex-1 truncate font-medium text-foreground/90" title={p.projectName}>{p.projectName}</span>
                  <FullyCoveredBadge coverage={cov} />
                  <span className="relative shrink-0"><OpenClosedBar open={p.open} closed={p.closed} /></span>
                  <span className="relative shrink-0 tabular-nums font-semibold text-foreground">{p.count.toLocaleString()}</span>
                </button>
                <AnimatedExpand open={isOpen}>
                  <div className="border-t border-border bg-muted/20 px-2.5 py-2">
                    {cov && (
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Data coverage</span>
                        <CoverageChips coverage={cov} />
                      </div>
                    )}
                    {loadingIds.has(p.projectId) ? (
                      <p className="py-3 text-center text-xs text-muted-foreground">Loading clashes…</p>
                    ) : erroredIds.has(p.projectId) ? (
                      <p className="py-3 text-center text-xs text-warning">Could not load clashes. Try again.</p>
                    ) : list && list.length > 0 ? (
                      <>
                        <TopAuthors clashes={list} onAuthorClick={onAuthorClick} />
                        <ul className="space-y-1.5">
                          {list.map((c, i) => (
                            <ClashCard key={`${c.displayId ?? "x"}-${i}`} c={c} index={i} onAuthorClick={onAuthorClick} />
                          ))}
                          {list.length >= 500 && (
                            <li className="pt-1 text-center text-[10px] text-muted-foreground/70">Showing the first 500 clashes.</li>
                          )}
                        </ul>
                      </>
                    ) : (
                      <p className="py-3 text-center text-xs text-muted-foreground">No individual clashes to show.</p>
                    )}
                  </div>
                </AnimatedExpand>
              </li>
            );
          })}
        </ul>
      )}

      {forbiddenProjects > 0 && (
        <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground/70">
          Based on {accessibleProjects} accessible projects. {forbiddenProjects} projects could not be scanned due to credentials.
        </p>
      )}
    </div>
  );
}
