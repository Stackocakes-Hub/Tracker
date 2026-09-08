import { createFileRoute } from "@tanstack/react-router";
import { sanitizeProjectId } from "@/lib/project-id";
import { MAX_PICTURE_BYTES, sanitizePictureName } from "@/lib/picture-names";
import { findPicture, uploadPicture, uploadPictureBytes } from "@/lib/pictures.server";

export const Route = createFileRoute("/api/picture")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const project = sanitizeProjectId(url.searchParams.get("project") || "");
          const name = sanitizePictureName(url.searchParams.get("name") || "");
          if (!project || !name) {
            return Response.json({ error: "project and name required" }, { status: 400 });
          }
          const found = await findPicture(project, name);
          if (!found) return new Response("Not found", { status: 404 });
          if (found.url && !found.bytes) {
            return Response.redirect(found.url, 302);
          }
          if (!found.bytes) return new Response("Not found", { status: 404 });
          return new Response(new Uint8Array(found.bytes), {
            headers: {
              "content-type": found.contentType,
              "x-content-type-options": "nosniff",
              "cache-control": "public, max-age=86400, immutable",
              "content-disposition": `inline; filename="${name}"`,
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
      POST: async ({ request }) => {
        try {
          const ctype = (request.headers.get("content-type") || "").toLowerCase();
          if (ctype.includes("application/json")) {
            const body = (await request.json()) as {
              project?: string;
              scope?: string;
              target?: string;
              data?: string;
              mime?: string;
            };
            if (!body.project || !body.data) {
              return Response.json({ ok: false, error: "project and picture required" }, { status: 400 });
            }
            const result = await uploadPicture({
              project: body.project,
              scope: body.scope === "discussion" ? "discussion" : "log",
              target: body.target || "IMG",
              data: body.data,
              mime: body.mime || "image/jpeg",
            });
            return Response.json(result);
          }

          const url = new URL(request.url);
          const project = url.searchParams.get("project") || "";
          const scope = url.searchParams.get("scope") === "discussion" ? "discussion" : "log";
          const target = url.searchParams.get("target") || "IMG";
          if (!project) {
            return Response.json({ ok: false, error: "project required" }, { status: 400 });
          }
          const buf = Buffer.from(await request.arrayBuffer());
          if (buf.length > MAX_PICTURE_BYTES) {
            return Response.json({ ok: false, error: "Picture is over 2 MB" }, { status: 413 });
          }
          const result = await uploadPictureBytes({ project, scope, target, bytes: buf });
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "upload failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
