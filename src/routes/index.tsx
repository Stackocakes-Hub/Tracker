import { createFileRoute } from "@tanstack/react-router";
import { ProjectHome } from "@/components/project-home";
import { fetchProjectList } from "@/lib/tracker-api";

export const Route = createFileRoute("/")({
  loader: () => fetchProjectList({ data: { force: true } }),
  staleTime: 0,
  preloadStaleTime: 0,
  gcTime: 0,
  component: Home,
});

function Home() {
  const initial = Route.useLoaderData();
  return <ProjectHome initial={initial.projects} />;
}
