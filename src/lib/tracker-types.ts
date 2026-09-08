export type TicketKind = "bug" | "feature" | "set" | "compat";

export type Bug = {
  id: string;
  filed: string;
  phase: string;
  severity: string;
  status: string;
  title: string;
  repro: string;
  expected: string;
  actual: string;
  notes: string;
  images: string[];
  updated: string;
};

export type Feature = {
  id: string;
  phase: string;
  size: string;
  status: string;
  title: string;
  notes: string;
  images: string[];
  updated: string;
};

export type SetItem = {
  id: string;
  phase: string;
  status: string;
  order: number;
  title: string;
  intent: string;
  exit: string;
  gates: string[];
  includes: string[];
  images: string[];
  updated: string;
};

export type Compat = {
  id: string;
  status: string;
  risk: string;
  watch: string;
  images: string[];
  updated: string;
};

export type Decision = { date: string; text: string };
export type Note = { date: string; topic: string; text: string };

export type DiscussionPost = {
  target: string;
  writer: string;
  written: string;
  body: string;
  file: string;
  images: string[];
};

export type LogFile = {
  name: string;
  written: string;
  writer: string;
  bytes: number;
  hash: string;
};

export type TrackerSnapshot = {
  app: string;
  subject: string;
  project: string;
  folder: string;
  revision: number;
  focusPhase: string;
  focusLabel: string;
  nextIds: { bug: number; feat: number; comp: number };
  bugs: Bug[];
  features: Feature[];
  sets: SetItem[];
  compat: Compat[];
  decisions: Decision[];
  notes: Note[];
  discussions: Record<string, DiscussionPost[]>;
  files: LogFile[];
  polledAt: string;
  logDir: string;
};
