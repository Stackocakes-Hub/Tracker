import { createFileRoute } from "@tanstack/react-router";
import { TrackerApp } from "@/components/tracker-app";
import { fetchTrackerSnapshot } from "@/lib/tracker-api";

export const Route = createFileRoute("/p/$project")({
  loader: ({ params }) => fetchTrackerSnapshot({ data: { project: params.project, force: true } }),
  staleTime: 0,
  preloadStaleTime: 0,
  gcTime: 0,
  component: ProjectLogs,
});

function ProjectLogs() {
  const { project } = Route.useParams();
  const initial = Route.useLoaderData();
  return <TrackerApp project={project} initial={initial} />;
}
