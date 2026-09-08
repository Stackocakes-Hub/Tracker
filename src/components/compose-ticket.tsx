import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { MAX_PICTURES } from "@/lib/picture-names";
import { encodePicture, uploadPendingPictures, type PendingPic } from "@/lib/picture-client";
import type { TicketKind } from "@/lib/tracker-types";

export function ComposeFab({
  project,
  onCreated,
}: {
  project: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        aria-label="Compose ticket"
        onClick={() => setOpen(true)}
        className="pointer-events-auto absolute bottom-0 right-0 flex size-14 items-center justify-center rounded-full border border-accent bg-accent text-accent-fg shadow-sm"
      >
        <Plus className="size-6" aria-hidden />
      </button>
      {open && (
        <ComposeSheet project={project} onClose={close} onCreated={onCreated} />
      )}
    </>
  );
}

function ComposeSheet({
  project,
  onClose,
  onCreated,
}: {
  project: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<TicketKind>("bug");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState("1");
  const [severity, setSeverity] = useState("normal");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [writer, setWriter] = useState<"design" | "impl">("design");
  const [pics, setPics] = useState<PendingPic[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function addFiles(list: File[]) {
    const room = MAX_PICTURES - pics.length;
    if (room <= 0) return;
    try {
      const next = await Promise.all(list.slice(0, room).map(encodePicture));
      setPics((cur) => [...cur, ...next].slice(0, MAX_PICTURES));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not attach picture");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setMsg("Title is required");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (pics.length) setMsg("Uploading pictures…");
      const imageNames = pics.length ? await uploadPendingPictures(project, "log", "IMG", pics) : [];
      const r = await fetch("/api/ticket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project,
          kind,
          title,
          notes,
          writer,
          phase,
          severity,
          expected,
          actual,
          imageNames,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; id?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      for (const p of pics) URL.revokeObjectURL(p.preview);
      onCreated();
      onClose();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-bg/70 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Dismiss" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-lg border border-border bg-surface p-4 sm:rounded-lg"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-medium">New ticket</h2>
          <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-md hover:bg-elevated" aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <label className="text-xs uppercase tracking-wider text-subtle">Type</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as TicketKind)}
          className="mt-1 min-h-11 rounded-md border border-border bg-bg px-3 py-2 text-sm"
        >
          <option value="bug">Bug</option>
          <option value="feature">Feature</option>
          <option value="set">Set</option>
          <option value="compat">Compat</option>
        </select>
        <label className="mt-3 text-xs uppercase tracking-wider text-subtle">Title</label>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="mt-1 min-h-11 rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        {kind === "bug" && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs uppercase tracking-wider text-subtle">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                >
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-subtle">Phase</label>
                <input
                  value={phase}
                  onChange={(e) => setPhase(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <label className="mt-3 text-xs uppercase tracking-wider text-subtle">Expected</label>
            <input
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              className="mt-1 min-h-11 rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
            <label className="mt-3 text-xs uppercase tracking-wider text-subtle">Actual</label>
            <input
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              className="mt-1 min-h-11 rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
          </>
        )}
        {kind !== "bug" && (
          <>
            <label className="mt-3 text-xs uppercase tracking-wider text-subtle">Phase</label>
            <input
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="mt-1 min-h-11 rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
          </>
        )}
        <label className="mt-3 text-xs uppercase tracking-wider text-subtle">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="mt-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        {pics.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {pics.map((p, i) => (
              <button
                key={p.preview}
                type="button"
                className="overflow-hidden rounded-md border border-border"
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
            disabled={pics.length >= MAX_PICTURES}
            onClick={() => fileRef.current?.click()}
            className="min-h-11 rounded-md border border-border px-3 py-2 text-sm hover:bg-elevated disabled:opacity-40"
          >
            Attach
          </button>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="ml-auto min-h-11 rounded-md border border-accent bg-accent px-4 py-2 text-sm text-accent-fg disabled:opacity-40"
          >
            {busy ? "Filing…" : "File ticket"}
          </button>
        </div>
        {msg && <p className="mt-2 font-mono text-xs text-danger">{msg}</p>}
      </form>
    </div>
  );
}
