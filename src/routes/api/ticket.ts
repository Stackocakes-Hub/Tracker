import { createFileRoute } from "@tanstack/react-router";
import { createTicket, type TicketKind } from "@/lib/create-ticket.server";

function kindOf(v: string | undefined): TicketKind | null {
  if (v === "bug" || v === "feature" || v === "set" || v === "compat") return v;
  return null;
}

export const Route = createFileRoute("/api/ticket")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const kind = kindOf(String(body.kind || ""));
          if (!body.project || !kind) {
            return Response.json({ ok: false, error: "project and kind required" }, { status: 400 });
          }
          const imageNames = Array.isArray(body.imageNames)
            ? (body.imageNames as unknown[]).map((n) => String(n)).filter(Boolean)
            : [];
          const images = Array.isArray(body.images)
            ? (body.images as { data?: string; mime?: string }[]).slice(0, 4).map((x) => ({
                data: String(x?.data || ""),
                mime: String(x?.mime || ""),
              }))
            : [];
          const result = await createTicket({
            project: String(body.project),
            kind,
            title: String(body.title || ""),
            notes: String(body.notes || ""),
            writer: body.writer === "impl" ? "impl" : "design",
            phase: String(body.phase || ""),
            severity: String(body.severity || ""),
            expected: String(body.expected || ""),
            actual: String(body.actual || ""),
            size: String(body.size || ""),
            intent: String(body.intent || ""),
            exit: String(body.exit || ""),
            risk: String(body.risk || ""),
            watch: String(body.watch || ""),
            images,
            imageNames,
          });
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "create failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
