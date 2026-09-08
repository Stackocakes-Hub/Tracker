import { createFileRoute } from "@tanstack/react-router";
import { applyIssueAction, type IssueAction } from "@/lib/write-issue.server";

export const Route = createFileRoute("/api/issue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            project?: string;
            id?: string;
            action?: string;
            notes?: string;
            writer?: string;
            images?: { data?: string; mime?: string }[];
            imageNames?: string[];
          };
          const action =
            body.action === "reopen" ? "reopen" : body.action === "close" ? "close" : body.action === "reply" ? "reply" : null;
          if (!body.project || !body.id || !action) {
            return Response.json({ ok: false, error: "project, id, and action required" }, { status: 400 });
          }
          const imageNames = Array.isArray(body.imageNames)
            ? body.imageNames.map((n) => String(n)).filter(Boolean)
            : [];
          const images = Array.isArray(body.images)
            ? body.images.slice(0, 4).map((x) => ({
                data: String(x?.data || ""),
                mime: String(x?.mime || ""),
              }))
            : [];
          const result = await applyIssueAction({
            project: body.project,
            id: body.id,
            action: action as IssueAction,
            notes: body.notes ?? "",
            writer: body.writer === "impl" ? "impl" : "design",
            images,
            imageNames,
          });
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "issue write failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
