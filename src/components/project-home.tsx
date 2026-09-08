import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ThemeFab } from "@/components/theme-fab";

type Project = { id: string; folder: string };

export function ProjectHome({ initial }: { initial?: Project[] }) {
  const [projects, setProjects] = useState<Project[]>(initial ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial?.length);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function load(force = false) {
    try {
      const r = await fetch(`/api/projects${force ? "?force=1" : ""}`, { cache: "no-store" });
      const j = (await r.json()) as { projects?: Project[]; error?: string };
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setProjects(j.projects ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not list projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPrompt(null);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; id?: string; prompt?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setCreated(j.id || name);
      setPrompt(j.prompt || "");
      setName("");
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border bg-surface px-5 py-6">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">TRACKER</p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight">Select a project</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Logs live in GitHub under <span className="font-mono text-fg">Logs-ProjectName/</span>.
          Pick a project to view bugs, or add one.
        </p>
        <p className="mt-2 font-mono text-xs text-subtle">
          <a
            className="text-accent underline underline-offset-2"
            href="https://github.com/Stackocakes-Hub/Tracker-Vault"
            target="_blank"
            rel="noreferrer"
          >
            Stackocakes-Hub/Tracker-Vault
          </a>
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 pb-32">
        {error && (
          <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="grid gap-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to="/p/$project"
              params={{ project: p.id }}
              className="rounded-lg border border-border bg-surface px-4 py-3 hover:border-accent"
            >
              <div className="text-base font-medium">{p.id}</div>
              <div className="font-mono text-xs text-muted">{p.folder}</div>
            </Link>
          ))}
          {loading && !projects.length && !error && (
            <p className="text-sm text-muted">Loading projects from GitHub…</p>
          )}
          {!loading && !projects.length && !error && (
            <p className="text-sm text-muted">No projects yet.</p>
          )}
        </div>

        <form onSubmit={create} className="mt-10 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium">Add project</h2>
          <p className="mt-1 text-sm text-muted">
            Creates <span className="font-mono text-fg">Logs-Name/</span>, PROTOCOL, and a closed
            creation log.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="min-w-48 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-md border border-accent bg-accent px-4 py-2 text-sm text-accent-fg disabled:opacity-40"
            >
              Create
            </button>
          </div>
        </form>

        {prompt && created && (
          <section className="mt-8">
            <h2 className="text-sm font-medium">AI usage prompt for {created}</h2>
            <p className="mt-1 text-sm text-muted">Paste this into the other Grok thread for this project.</p>
            <textarea
              readOnly
              value={prompt}
              rows={16}
              className="mt-3 w-full rounded-lg border border-border bg-surface p-3 font-mono text-xs"
            />
            <Link
              to="/p/$project"
              params={{ project: created }}
              className="mt-3 inline-block text-sm text-accent underline underline-offset-2"
            >
              Open {created}
            </Link>
          </section>
        )}
      </main>
      <div className="pointer-events-none fixed inset-x-4 z-30 mx-auto h-14 max-w-3xl bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4.5rem))]">
        <ThemeFab />
      </div>
    </div>
  );
}
