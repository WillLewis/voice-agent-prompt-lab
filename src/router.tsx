import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { getViteBasePath } from "./lib/basePath";

export const getRouter = () => {
  const queryClient = new QueryClient();
  const basepath = getViteBasePath();

  const router = createRouter({
    routeTree,
    basepath: basepath || undefined,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
