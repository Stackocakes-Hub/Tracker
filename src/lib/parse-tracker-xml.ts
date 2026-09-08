import type { Bug, Compat, Decision, DiscussionPost, Feature, Note, SetItem } from "./tracker-types";
import { extractImageNames } from "./picture-names";

function decode(s: string) {
  return s
    .replace(/\u0026lt;/g, "<")
    .replace(/\u0026gt;/g, ">")
    .replace(/\u0026quot;/g, '"')
    .replace(/\u0026apos;/g, "'")
    .replace(/\u0026amp;/g, "&");
}

function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decode(m[1]) : "";
}

function inner(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1].trim()) : "";
}

function blocks(xml: string, tag: string) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>|<${tag}(\\s[^>]*)?/>`, "g");
  const out: { open: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push({ open: m[1] || m[3] || "", body: m[2] || "" });
  }
  return out;
}

export type ParsedLog = {
  writer: string;
  written: string;
  app: string;
  subject: string;
  revision?: number;
  focusPhase?: string;
  focusLabel?: string;
  nextIds?: { bug: number; feat: number; comp: number };
  bugs: Bug[];
  features: Feature[];
  sets: SetItem[];
  compat: Compat[];
  decisions: Decision[];
  notes: Note[];
};

export function parseDiscussionXml(xml: string, file: string): DiscussionPost | null {
  const root = xml.match(/<discussion([^>]*)>/);
  if (!root) return null;
  const open = root[1] || "";
  let target = attr(open, "target") || attr(open, "id");
  if (!target) {
    const m = file.match(/(BUG-\d+|FEAT-\d+|SET-[\w.]+|COMP-\d+)/i);
    if (m) target = m[1].toUpperCase().replace("SET-", "SET-");
  }
  const body = inner(xml, "body");
  const images = extractImageNames(xml);
  if (!target || (!body && images.length === 0)) return null;
  return {
    target: target.toUpperCase(),
    writer: attr(open, "writer") || "unknown",
    written: attr(open, "written"),
    body,
    file,
    images,
  };
}

export function parseTrackerXml(xml: string): ParsedLog {
  const root = xml.match(/<trackerLog([^>]*)>/);
  const rootAttrs = root?.[1] ?? "";
  const logWritten = attr(rootAttrs, "written");
  const next = xml.match(/<nextIds([^/]*)\/>/);
  const focusOpen = xml.match(/<focus([^>]*)>([\s\S]*?)<\/focus>/);

  const bugs: Bug[] = blocks(xml, "bug").map(({ open, body }) => ({
    id: attr(open, "id"),
    filed: attr(open, "filed"),
    phase: attr(open, "phase"),
    severity: attr(open, "severity"),
    status: attr(open, "status"),
    title: inner(body, "title"),
    repro: inner(body, "repro"),
    expected: inner(body, "expected"),
    actual: inner(body, "actual"),
    notes: inner(body, "notes"),
    images: extractImageNames(body),
    updated: logWritten || attr(open, "filed") || "",
  }));

  const features: Feature[] = blocks(xml, "feature").map(({ open, body }) => ({
    id: attr(open, "id"),
    phase: attr(open, "phase"),
    size: attr(open, "size"),
    status: attr(open, "status"),
    title: inner(body, "title"),
    notes: inner(body, "notes"),
    images: extractImageNames(body),
    updated: logWritten,
  }));

  const sets: SetItem[] = blocks(xml, "set").map(({ open, body }) => ({
    id: attr(open, "id"),
    phase: attr(open, "phase"),
    status: attr(open, "status"),
    order: Number(attr(open, "order") || "0"),
    title: inner(body, "title"),
    intent: inner(body, "intent"),
    exit: inner(body, "exit"),
    gates: [...body.matchAll(/<gate>([\s\S]*?)<\/gate>/g)].map((x) => decode(x[1])),
    includes: [...body.matchAll(/<include>([\s\S]*?)<\/include>/g)].map((x) => decode(x[1])),
    images: extractImageNames(body),
    updated: logWritten,
  }));

  const compat: Compat[] = blocks(xml, "compat").map(({ open, body }) => ({
    id: attr(open, "id"),
    status: attr(open, "status"),
    risk: inner(body, "risk"),
    watch: inner(body, "watch"),
    images: extractImageNames(body),
    updated: logWritten,
  }));

  const decisions: Decision[] = blocks(xml, "decision").map(({ open, body }) => ({
    date: attr(open, "date"),
    text: decode(body.trim()),
  }));

  const notes: Note[] = blocks(xml, "note").map(({ open, body }) => ({
    date: attr(open, "date"),
    topic: attr(open, "topic"),
    text: decode(body.trim()),
  }));

  return {
    writer: attr(rootAttrs, "writer"),
    written: attr(rootAttrs, "written"),
    app: inner(xml, "app") || "Tracker",
    subject: inner(xml, "subject") || "",
    revision: inner(xml, "revision") ? Number(inner(xml, "revision")) : undefined,
    focusPhase: focusOpen ? attr(focusOpen[1] || "", "phase") : undefined,
    focusLabel: focusOpen ? decode(focusOpen[2].trim()) : undefined,
    nextIds: next
      ? {
          bug: Number(attr(next[1], "bug") || 1),
          feat: Number(attr(next[1], "feat") || 1),
          comp: Number(attr(next[1], "comp") || 1),
        }
      : undefined,
    bugs,
    features,
    sets,
    compat,
    decisions,
    notes,
  };
}

function mergeById<T extends { id: string }>(prev: T[], next: T[]): T[] {
  const map = new Map(prev.map((x) => [x.id, x]));
  for (const item of next) {
    if (!item.id) continue;
    const old = map.get(item.id);
    map.set(item.id, old ? ({ ...old, ...stripEmpty(item) } as T) : item);
  }
  return [...map.values()];
}

function stripEmpty<T extends object>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out) as (keyof T)[]) {
    const v = out[k];
    if (v === "" || v === undefined || (Array.isArray(v) && v.length === 0)) {
      delete out[k];
    }
  }
  return out;
}

export function mergeParsed(files: ParsedLog[]): ParsedLog {
  const acc: ParsedLog = {
    writer: "",
    written: "",
    app: "Tracker",
    subject: "",
    bugs: [],
    features: [],
    sets: [],
    compat: [],
    decisions: [],
    notes: [],
  };
  for (const p of files) {
    acc.writer = p.writer || acc.writer;
    acc.written = p.written || acc.written;
    acc.app = p.app || acc.app;
    acc.subject = p.subject || acc.subject;
    if (p.revision != null) acc.revision = p.revision;
    if (p.focusPhase) acc.focusPhase = p.focusPhase;
    if (p.focusLabel) acc.focusLabel = p.focusLabel;
    if (p.nextIds) acc.nextIds = p.nextIds;
    acc.bugs = mergeById(acc.bugs, p.bugs);
    acc.features = mergeById(acc.features, p.features);
    acc.sets = mergeById(acc.sets, p.sets);
    acc.compat = mergeById(acc.compat, p.compat);
    acc.decisions = [...acc.decisions, ...p.decisions];
    acc.notes = [...acc.notes, ...p.notes];
  }
  acc.sets.sort((a, b) => a.order - b.order);
  return acc;
}

export function mergeDiscussions(posts: DiscussionPost[]): Record<string, DiscussionPost[]> {
  const seen = new Set<string>();
  const by: Record<string, DiscussionPost[]> = {};
  for (const p of posts) {
    const key = `${p.target}|${p.written}|${p.writer}|${p.body}|${p.images.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (by[p.target] ??= []).push(p);
  }
  for (const id of Object.keys(by)) {
    by[id].sort((a, b) => a.written.localeCompare(b.written) || a.file.localeCompare(b.file));
  }
  return by;
}
