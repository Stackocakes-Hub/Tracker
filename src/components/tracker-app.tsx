import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { DiscussionPost, TrackerSnapshot } from "@/lib/tracker-types";
import { MAX_PICTURES, sanitizePictureHref } from "@/lib/picture-names";
import { encodePicture, uploadPendingPictures, type PendingPic } from "@/lib/picture-client";
import { ThemeFab } from "@/components/theme-fab";
import { ComposeFab } from "@/components/compose-ticket";

const TrackerCtx = createContext<{
  project: string;
  reload: (force?: boolean) => Promise<void> | void;
  openPicture: (src: string) => void;
}>({
  project: "",
  reload: () => {},
  openPicture: () => {},
});

const TABS = [
  "now",
  "all",
  "bugs",
  "sets",
  "features",
  "compat",
  "notes",
  "decisions",
  "files",
  "howto",
] as const;
type Tab = (typeof TABS)[number];

function hay(...parts: string[]) {
  return parts.join(" ").toLowerCase();
}

function hit(q: string, ...parts: string[]) {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return hay(...parts).includes(n);
}

function lastStamp(id: string, stamp: string | undefined, talks: Record<string, DiscussionPost[]>) {
  let t = Date.parse(stamp || "") || 0;
  for (const p of talks[id] ?? []) {
    const u = Date.parse(p.written || "");
    if (u > t) t = u;
  }
  return t ? new Date(t).toISOString() : "";
}

function relTime(iso: string, now: number) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || t <= 0) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  if (s < 90) return "1 min ago";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 5400) return "1 hour ago";
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 172800) return "yesterday";
  const days = Math.round(s / 86400);
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} months ago`;
  const years = Math.round(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function pill(status: string) {
  const s = status.toLowerCase();
  const tone =
    s === "open" || s === "confirmed" || s === "reopened"
      ? "bg-danger/15 text-danger"
      : s === "in-progress"
        ? "bg-accent/15 text-accent"
        : s === "specified" || s === "done" || s === "fixed" || s === "verified" || s === "closed"
          ? "bg-ok/15 text-ok"
          : s === "watch" || s === "wontfix"
            ? "bg-warn/15 text-warn"
            : "bg-elevated text-muted";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 font-mono text-xs ${tone}`}>
      {status}
    </span>
  );
}

async function pullLogs(project: string, force = false): Promise<TrackerSnapshot> {
  const q = force ? "?force=1" : "";
  const r = await fetch(`/api/logs/${encodeURIComponent(project)}${q}`, {
    cache: "no-store",
    headers: { pragma: "no-cache", "x-tracker-project": project },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Tracker-Log HTTP ${r.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }
  return r.json();
}

export function TrackerApp({
  project,
  initial,
}: {
  project: string;
  initial?: TrackerSnapshot | null;
}) {
  const [data, setData] = useState<TrackerSnapshot | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [now, setNow] = useState(() => Date.now());
  const [hits, setHits] = useState(0);
  const [search, setSearch] = useState("");
  const [picture, setPicture] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const openPicture = useCallback((src: string) => setPicture(src), []);

  const load = useCallback(
    async (force = false) => {
      try {
        const snap = await pullLogs(project, force);
        setData(snap);
        setError(null);
        setHits((n) => n + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read logs");
      }
    },
    [project],
  );

  useEffect(() => {
    void load(true);
    const poll = setInterval(() => void load(false), 10_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  useEffect(() => {
    function typing(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "/" && !typing(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ageSec = data ? Math.max(0, Math.floor((now - Date.parse(data.polledAt)) / 1000)) : null;
  const talks = data?.discussions ?? {};
  const talkCount = Object.values(talks).reduce((n, a) => n + a.length, 0);
  const q = search;

  const bugs = useMemo(
    () =>
      (data?.bugs ?? []).filter((b) =>
        hit(q, b.id, b.title, b.status, b.phase, b.notes, b.expected, b.actual, b.severity),
      ),
    [data, q],
  );
  const features = useMemo(
    () => (data?.features ?? []).filter((f) => hit(q, f.id, f.title, f.status, f.phase, f.notes)),
    [data, q],
  );
  const sets = useMemo(
    () => (data?.sets ?? []).filter((s) => hit(q, s.id, s.title, s.status, s.phase, s.intent, s.exit)),
    [data, q],
  );
  const compat = useMemo(
    () => (data?.compat ?? []).filter((c) => hit(q, c.id, c.status, c.risk, c.watch)),
    [data, q],
  );
  const notes = useMemo(
    () => (data?.notes ?? []).filter((n) => hit(q, n.date, n.topic, n.text)),
    [data, q],
  );
  const decisions = useMemo(
    () => (data?.decisions ?? []).filter((d) => hit(q, d.date, d.text)),
    [data, q],
  );
  const files = useMemo(
    () => (data?.files ?? []).filter((f) => hit(q, f.name, f.writer, f.written, f.hash)),
    [data, q],
  );

  const openBugs = useMemo(
    () => bugs.filter((b) => !["closed", "verified", "wontfix", "fixed"].includes(b.status)),
    [bugs],
  );
  const wip = useMemo(
    () =>
      features.filter((f) =>
        ["in-progress", "specified", "watch", "done", "open"].includes(f.status),
      ),
    [features],
  );
  const allRows = useMemo(
    () => [
      ...bugs.map((b) => [b.id, "bug", b.phase, b.title, b.status, lastStamp(b.id, b.updated || b.filed, talks)]),
      ...sets.map((s) => [s.id, "set", s.phase, s.title, s.status, lastStamp(s.id, s.updated, talks)]),
      ...features.map((f) => [f.id, "feature", f.phase, f.title, f.status, lastStamp(f.id, f.updated, talks)]),
      ...compat.map((c) => [c.id, "compat", "", c.risk || c.watch, c.status, lastStamp(c.id, c.updated, talks)]),
    ],
    [bugs, sets, features, compat, talks],
  );

  return (
    <TrackerCtx.Provider value={{ project, reload: load, openPicture }}>
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs tracking-[0.2em] text-accent">TRACKER</p>
          <p className="flex items-center gap-2 font-mono text-xs text-muted">
            <span
              className={`inline-block size-2 rounded-full ${error ? "bg-danger" : "bg-ok"}`}
              aria-hidden
            />
            {error ? "poll failed" : "live"}
            {ageSec != null ? ` · ${ageSec}s ago` : ""}
            {` · ${hits} loads`}
            <button
              type="button"
              onClick={() => void load(true)}
              className="rounded border border-border px-2 py-0.5 text-fg hover:bg-elevated"
            >
              Refresh
            </button>
          </p>
        </div>
        <h1 className="mt-1 text-xl font-medium tracking-tight">{project}</h1>
        <Link
          to="/"
          className="mt-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-accent bg-accent px-5 text-base font-medium text-accent-fg active:opacity-80"
        >
          All projects
        </Link>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          folder <span className="font-mono text-fg">Logs-{project}</span>
          {" · "}
          GitHub{" "}
          <a
            className="font-mono text-accent underline underline-offset-2"
            href="https://github.com/Stackocakes-Hub/Tracker-Vault"
            target="_blank"
            rel="noreferrer"
          >
            Tracker-Vault
          </a>
          . Polls every 10 seconds (this project folder only). Refresh or any write reloads immediately.
        </p>
        <p className="mt-2 font-mono text-xs text-subtle">
          {data
            ? `${data.files.length} files · rev ${data.revision} · ${talkCount} discussion posts · next BUG-${String(data.nextIds.bug).padStart(3, "0")}`
            : "connecting to Tracker-Log…"}
          {data?.logDir ? (
            <span className="block truncate text-[11px] text-subtle">{data.logDir}</span>
          ) : null}
        </p>
      </header>

      <nav className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface/95 px-5 py-3 backdrop-blur">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              tab === id
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-muted hover:text-fg"
            }`}
          >
            {id === "howto" ? "How to update" : id === "all" ? "All" : id}
          </button>
        ))}
        <label className="relative ml-auto min-w-[12rem] flex-1 basis-48">
          <span className="sr-only">Search tickets</span>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (search) setSearch("");
                else (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Search  /"
            className="min-h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"
          />
        </label>
      </nav>

      <main className="mx-auto max-w-6xl px-5 py-6 pb-32">
        {error && (
          <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        {search.trim() && tab !== "howto" ? (
          <p className="mb-3 font-mono text-xs text-muted">
            Filter “{search.trim()}” · {tab === "all" ? allRows.length : "this tab"} shown
          </p>
        ) : null}
        {!data && !error && <p className="text-muted">Reading Tracker-Log…</p>}
        {data && tab === "now" && (
          <div>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card k="Subject" v={data.subject} s={`focus ${data.focusPhase}`} />
              <Card k="Open bugs" v={String(openBugs.length)} s={openBugs.map((b) => b.id).join(", ") || "none"} />
              <Card k="In progress" v={String(wip.length)} s={wip.map((f) => f.id).join(", ") || "—"} />
              <Card k="Discussions" v={String(talkCount)} s={`${Object.keys(talks).length} ids`} />
            </div>
            <h2 className="mb-3 text-sm font-medium text-accent">Active — click a row to talk</h2>
            {openBugs.length + wip.length === 0 ? (
              <p className="mb-4 text-sm text-muted">
                Nothing active in this project. Closed tickets are on the All tab.
              </p>
            ) : null}
            <Table
              now={now}
              heads={["ID", "Phase", "Title", "Status", "Last Updated"]}
              rows={[
                ...openBugs.map((b) => [b.id, b.phase, b.title, b.status, lastStamp(b.id, b.updated || b.filed, talks)]),
                ...wip.map((f) => [f.id, f.phase, f.title, f.status, lastStamp(f.id, f.updated, talks)]),
              ]}
              discussions={talks}
            />
          </div>
        )}
        {data && tab === "all" && (
          <div>
            <h2 className="mb-3 text-sm font-medium text-accent">
              All — every bug, set, feature, and compat. No status or type cut.
            </h2>
            <Table
              now={now}
              heads={["ID", "Type", "Phase", "Title", "Status", "Last Updated"]}
              rows={allRows}
              discussions={talks}
            />
          </div>
        )}
        {data && tab === "bugs" && (
          <Table
            now={now}
            heads={["ID", "Sev", "Title", "Expected", "Actual", "Status", "Last Updated"]}
            rows={bugs.map((b) => [
              b.id,
              b.severity,
              b.title,
              b.expected,
              b.actual,
              b.status,
              lastStamp(b.id, b.updated || b.filed, talks),
            ])}
            discussions={talks}
          />
        )}
        {data && tab === "sets" && (
          <Table
            now={now}
            heads={["ID", "Phase", "Title", "Exit", "Gates", "Status", "Last Updated"]}
            rows={sets.map((s) => [
              s.id,
              s.phase,
              `${s.title} — ${s.intent}`,
              s.exit,
              s.gates.join(", "),
              s.status,
              lastStamp(s.id, s.updated, talks),
            ])}
            discussions={talks}
          />
        )}
        {data && tab === "features" && (
          <Table
            now={now}
            heads={["ID", "Phase", "Title", "Notes", "Status", "Last Updated"]}
            rows={features.map((f) => [
              f.id,
              f.phase,
              f.title,
              f.notes,
              f.status,
              lastStamp(f.id, f.updated, talks),
            ])}
            discussions={talks}
          />
        )}
        {data && tab === "compat" && (
          <Table
            now={now}
            heads={["ID", "Risk", "Watch", "Status", "Last Updated"]}
            rows={compat.map((c) => [c.id, c.risk, c.watch, c.status, lastStamp(c.id, c.updated, talks)])}
            discussions={talks}
          />
        )}
        {data && tab === "notes" && (
          <Table heads={["Date", "Topic", "Point"]} rows={notes.map((n) => [n.date, n.topic, n.text])} />
        )}
        {data && tab === "decisions" && (
          <Table heads={["Date", "Decision"]} rows={decisions.map((d) => [d.date, d.text])} />
        )}
        {data && tab === "files" && (
          <Table
            heads={["File", "Writer", "Written", "Bytes", "Hash"]}
            rows={files.map((f) => [f.name, f.writer, f.written, String(f.bytes), f.hash])}
          />
        )}
        {tab === "howto" && <HowTo />}
      </main>
      <div className="pointer-events-none fixed inset-x-4 z-30 mx-auto h-14 max-w-6xl bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4.5rem))]">
        <ThemeFab />
        <ComposeFab project={project} onCreated={() => void load(true)} />
      </div>
      {picture ? <PicturePalette src={picture} onClose={() => setPicture(null)} /> : null}
    </div>
    </TrackerCtx.Provider>
  );
}

function Card({ k, v, s }: { k: string; v: string; s: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-subtle">{k}</p>
      <p className="mt-1 text-lg font-medium">{v}</p>
      <p className="mt-1 font-mono text-xs text-muted">{s}</p>
    </div>
  );
}

function natural(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function statusRank(s: string) {
  const order = [
    "open",
    "confirmed",
    "reopened",
    "in-progress",
    "specified",
    "watch",
    "fixed",
    "verified",
    "done",
    "wontfix",
    "closed",
  ];
  const i = order.indexOf(s.toLowerCase());
  return i < 0 ? 50 : i;
}

function Table({
  heads,
  rows,
  discussions,
  now,
}: {
  heads: string[];
  rows: string[][];
  discussions?: Record<string, DiscussionPost[]>;
  now?: number;
}) {
  const [sortKey, setSortKey] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [open, setOpen] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1);
  const rowEls = useRef<(HTMLTableRowElement | null)[]>([]);
  const expandable = Boolean(discussions);
  const statusIdx = heads.findIndex((h) => h === "Status");
  const updatedIdx = heads.findIndex((h) => h === "Last Updated");
  const clock = now ?? Date.now();

  const sorted = useMemo(() => {
    const idx = Math.min(Math.max(0, sortKey), Math.max(0, heads.length - 1));
    const label = heads[idx] || "";
    return [...rows].sort((a, b) => {
      const av = a[idx] ?? "";
      const bv = b[idx] ?? "";
      const c =
        label === "Status"
          ? statusRank(av) - statusRank(bv) || natural(av, bv)
          : label === "Last Updated"
            ? (Date.parse(av) || 0) - (Date.parse(bv) || 0)
            : natural(av, bv);
      return c * dir;
    });
  }, [rows, sortKey, dir, heads]);

  const move = useCallback(
    (delta: number) => {
      if (!sorted.length) return;
      setCursor((c) => {
        if (c < 0) return delta > 0 ? 0 : sorted.length - 1;
        return Math.min(sorted.length - 1, Math.max(0, c + delta));
      });
    },
    [sorted.length],
  );

  useEffect(() => {
    if (cursor < 0) return;
    rowEls.current[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  useEffect(() => {
    function typing(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (typing(e.target)) return;
      if (document.querySelector("[data-picture-palette]")) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (expandable && (e.key === "Enter" || e.key === " ")) {
        if (cursor < 0 || !sorted[cursor]) return;
        e.preventDefault();
        const id = sorted[cursor][0] || "";
        if (!id) return;
        setOpen((o) => (o === id ? null : id));
      } else if (e.key === "Escape") {
        setOpen(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, expandable, cursor, sorted]);

  function toggleSort(i: number) {
    if (i === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(i);
      setDir(heads[i] === "Last Updated" ? -1 : 1);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      {expandable ? (
        <p className="border-b border-border bg-elevated px-3 py-1.5 font-mono text-[11px] text-subtle">
          ↑ ↓ move row · Enter open · Esc close · / search
        </p>
      ) : null}
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="bg-elevated text-xs uppercase tracking-wider text-subtle">
          <tr>
            {heads.map((h, i) => (
              <th key={h} className="px-3 py-2 font-medium">
                <button type="button" onClick={() => toggleSort(i)} className="text-left hover:text-fg">
                  {h}
                  {sortKey === i ? (dir === 1 ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => {
            const id = row[0] || `${ri}`;
            const isOpen = expandable && open === id;
            const isCursor = cursor === ri;
            return (
              <Fragment key={`${id}-${ri}`}>
                <tr
                  ref={(el) => {
                    rowEls.current[ri] = el;
                  }}
                  className={`border-t border-border ${expandable ? "cursor-pointer hover:bg-elevated/60" : ""} ${isOpen ? "bg-elevated/40" : ""} ${isCursor ? "outline outline-2 outline-offset-[-2px] outline-accent" : ""}`}
                  onClick={() => {
                    setCursor(ri);
                    if (expandable) setOpen(isOpen ? null : id);
                  }}
                >
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 align-top">
                      {ci === statusIdx
                        ? pill(cell)
                        : ci === updatedIdx
                          ? relTime(cell, clock)
                          : cell}
                    </td>
                  ))}
                </tr>
                {isOpen && discussions && (
                  <tr className="border-t border-border bg-bg">
                    <td colSpan={heads.length} className="px-3 py-4">
                      <Thread id={id} posts={discussions[id] ?? []} status={row[statusIdx] || ""} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Thread({
  id,
  posts,
  status,
}: {
  id: string;
  posts: DiscussionPost[];
  status: string;
}) {
  const { project } = useContext(TrackerCtx);
  return (
    <div className="space-y-3">
      <p className="font-mono text-xs text-subtle">
        {id} · {posts.length} post{posts.length === 1 ? "" : "s"} · ID-Discussion
      </p>
      {posts.length === 0 && (
        <p className="text-sm text-muted">No discussion yet. Reply, close, or reopen this id.</p>
      )}
      {posts.map((p, i) => (
        <article key={`${p.file}-${i}`} className="rounded-md border border-border bg-surface p-3">
          <p className="font-mono text-xs text-muted">
            {p.writer} · {p.written}
          </p>
          {p.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{p.body}</p> : null}
          <PostPictures project={project} names={p.images ?? []} />
        </article>
      ))}
      <IssueActions id={id} status={status} />
    </div>
  );
}

function PostPictures({ project, names }: { project: string; names: string[] }) {
  if (!names.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {names.map((name) => (
        <SafePicture key={name} project={project} name={name} />
      ))}
    </div>
  );
}

function SafePicture({ project, name }: { project: string; name: string }) {
  const { openPicture } = useContext(TrackerCtx);
  const [ok, setOk] = useState(true);
  const remote = name.startsWith("https://") ? sanitizePictureHref(name) : null;
  const src = remote || `/api/picture?project=${encodeURIComponent(project)}&name=${encodeURIComponent(name)}`;
  if (!ok || (name.startsWith("https://") && !remote)) {
    return <p className="font-mono text-xs text-muted">Picture unavailable</p>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openPicture(src);
      }}
      className="max-w-full shrink-0 rounded-md text-left"
    >
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className="max-h-48 w-auto max-w-full rounded-md border border-border bg-bg object-contain"
        onError={() => setOk(false)}
      />
    </button>
  );
}

function PicturePalette({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div
      data-picture-palette
      role="dialog"
      aria-modal="true"
      aria-label="Picture"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] max-w-[96vw] overflow-auto rounded-lg border border-border bg-surface p-2 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="sticky top-2 right-2 float-right z-10 min-h-11 rounded-md border border-border bg-elevated px-3 text-sm"
        >
          Close
        </button>
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="mt-2 block h-auto w-auto max-w-none"
        />
      </div>
    </div>
  );
}

function IssueActions({ id, status }: { id: string; status: string }) {
  const { project, reload } = useContext(TrackerCtx);
  const [notes, setNotes] = useState("");
  const [writer, setWriter] = useState<"design" | "impl">("design");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pics, setPics] = useState<PendingPic[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const closed = ["closed", "verified", "wontfix"].includes(status);
  const canReply = Boolean(notes.trim() || pics.length);

  async function addFiles(list: File[]) {
    const room = MAX_PICTURES - pics.length;
    if (room <= 0) {
      setMsg(`At most ${MAX_PICTURES} pictures`);
      return;
    }
    setMsg(null);
    try {
      const next = await Promise.all(list.slice(0, room).map(encodePicture));
      setPics((cur) => [...cur, ...next].slice(0, MAX_PICTURES));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not attach picture");
    }
  }

  function clearPics() {
    for (const p of pics) URL.revokeObjectURL(p.preview);
    setPics([]);
  }

  async function run(action: "close" | "reopen" | "reply") {
    setBusy(true);
    setMsg(null);
    try {
      if (pics.length) setMsg("Uploading pictures…");
      const imageNames = pics.length
        ? await uploadPendingPictures(project, action === "reply" ? "discussion" : "log", id, pics)
        : [];
      const r = await fetch("/api/issue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project,
          id,
          action,
          notes,
          writer,
          imageNames,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; status?: string; vault?: boolean };
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(action === "reply" ? "Posted" : `${action === "close" ? "Closed" : "Reopened"} as ${j.status}`);
      setNotes("");
      clearPics();
      await reload(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!/^(BUG|FEAT|SET|COMP)-/.test(id)) return null;

  return (
    <div
      className="rounded-md border border-border bg-surface p-3"
      onClick={(e) => e.stopPropagation()}
      onPaste={(e) => {
        const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length) return;
        e.preventDefault();
        void addFiles(files);
      }}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
        if (!files.length) return;
        e.preventDefault();
        void addFiles(files);
      }}
    >
      <p className="text-xs uppercase tracking-wider text-subtle">Issue actions</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canReply && !busy) {
            e.preventDefault();
            void run("reply");
          }
        }}
        rows={3}
        placeholder="Write a reply… paste or attach a screenshot"
        className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
      />
      {pics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {pics.map((p, i) => (
            <button
              key={p.preview}
              type="button"
              className="relative overflow-hidden rounded-md border border-border"
              onClick={() => {
                URL.revokeObjectURL(p.preview);
                setPics((cur) => cur.filter((_, j) => j !== i));
              }}
              aria-label="Remove picture"
            >
              <img src={p.preview} alt="" className="size-16 object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={writer}
          onChange={(e) => setWriter(e.target.value === "impl" ? "impl" : "design")}
          className="min-h-11 rounded-md border border-border bg-bg px-2 py-2 text-sm"
        >
          <option value="design">design</option>
          <option value="impl">impl</option>
        </select>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) void addFiles(files);
          }}
        />
        <button
          type="button"
          disabled={busy || pics.length >= MAX_PICTURES}
          onClick={() => fileRef.current?.click()}
          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm hover:bg-elevated disabled:opacity-40"
        >
          Attach
        </button>
        <button
          type="button"
          disabled={busy || !canReply}
          onClick={() => void run("reply")}
          className="min-h-11 rounded-md border border-accent bg-accent px-4 py-2 text-sm text-accent-fg disabled:opacity-40"
        >
          Reply
        </button>
        <button
          type="button"
          disabled={busy || closed}
          onClick={() => void run("close")}
          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm hover:bg-elevated disabled:opacity-40"
        >
          Close
        </button>
        <button
          type="button"
          disabled={busy || !closed}
          onClick={() => void run("reopen")}
          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm hover:bg-elevated disabled:opacity-40"
        >
          Reopen
        </button>
      </div>
      {msg && <p className="mt-2 font-mono text-xs text-muted">{msg}</p>}
    </div>
  );
}

function HowTo() {
  return (
    <article className="max-w-2xl space-y-4 text-sm leading-relaxed text-muted">
      <h2 className="text-fg text-base font-medium">How to update Tracker</h2>
      <p>
        Vault:{" "}
        <a
          className="font-mono text-accent underline underline-offset-2"
          href="https://github.com/Stackocakes-Hub/Tracker-Vault"
          target="_blank"
          rel="noreferrer"
        >
          Stackocakes-Hub/Tracker-Vault
        </a>
      </p>
      <h3 className="text-fg font-medium">Write contract</h3>
      <p>
        Canonical protocol is on GitHub:{" "}
        <a
          className="font-mono text-accent underline underline-offset-2"
          href="https://github.com/Stackocakes-Hub/Tracker-Vault/blob/main/PROTOCOL.md"
          target="_blank"
          rel="noreferrer"
        >
          PROTOCOL.md
        </a>
        . Hash names, three-file commit, revision, writers, and nextIds live there — not in local
        artifacts.
      </p>
      <p>
        Each project is <span className="font-mono text-fg">Logs-ProjectName/</span> on GitHub.
        Framefield is <span className="font-mono text-fg">Logs-FrameField</span>. Tracker itself is{" "}
        <span className="font-mono text-fg">Logs-Tracker</span>.
      </p>
      <p>
        Expand a row. Reply posts to ID-Discussion without changing status. Close writes{" "}
        <span className="font-mono text-fg">status="closed"</span>. Reopen writes{" "}
        <span className="font-mono text-fg">status="open"</span>. The compose button files a new ticket.
      </p>
      <h3 className="text-fg font-medium">Rename (title)</h3>
      <p>
        Ids never change. To rename, write a new dated XML with the same id and a new{" "}
        <span className="font-mono text-fg">{"<title>"}</span>. Omit{" "}
        <span className="font-mono text-fg">status=</span> so status stays. Do not mint a new id. Do
        not edit the old file.
      </p>
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 font-mono text-xs text-fg">{`<feature id="FEAT-009">
  <title>Ticket search (/)</title>
  <notes>Renamed from "Search box and / shortcut".</notes>
</feature>`}</pre>
      <h3 className="text-fg font-medium">Questions and replies (ID discussion)</h3>
      <p>
        One new XML file per message in{" "}
        <span className="font-mono text-fg">Logs-ProjectName/ID-Discussion/</span>. Scanner follows that
        folder's MANIFEST.txt. Click a line on the site to expand the thread.
      </p>
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 font-mono text-xs text-fg">{`<?xml version="1.0" encoding="UTF-8"?>
<discussion schema="1" target="BUG-001" writer="impl" written="2026-09-05T12:00:00-05:00">
  <app>Tracker</app>
  <body>Should tiny squares skip the pixel min-size clamp on stroke too?</body>
  <image name="BUG-001-2026-09-05T120000Z-ab12cd34.png"/>
</discussion>`}</pre>
      <p>
        Filename: <span className="font-mono text-fg">TARGET-YYYY-MM-DDTHHmmssZ-hash.xml</span>.
        Append that name to <span className="font-mono text-fg">Logs-ProjectName/ID-Discussion/MANIFEST.txt</span>.
        Do not edit old discussion files. Replies are new files with the same target.
      </p>
      <h3 className="text-fg font-medium">Pictures</h3>
      <p>
        <strong className="text-fg">Grok</strong> hosts the file on https they control. They do not POST to
        Tracker (Grok login blocks that) and they do not put bytes in GitHub. XML:
      </p>
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 font-mono text-xs text-fg">{`<image href="https://your-host.example/concept.jpg"/>`}</pre>
      <p>
        Website compose/reply still uploads through this site. That path is for humans in the UI, not
        adjacent Grok. href must be https, no SVG. Broken links are skipped.
      </p>
    </article>
  );
}
