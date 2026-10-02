import { type ReactNode, useEffect, useState } from "react";

export interface KeepAliveRoute {
  id: string;
  element: ReactNode;
}

export function KeepAliveRoutes({
  activeId,
  routes,
  className = "route-cache-page",
}: {
  activeId: string;
  routes: KeepAliveRoute[];
  className?: string;
}) {
  const [visited, setVisited] = useState(() => new Set([activeId]));

  useEffect(() => {
    setVisited((current) => {
      if (current.has(activeId)) return current;
      const next = new Set(current);
      next.add(activeId);
      return next;
    });
  }, [activeId]);

  return routes.map((route) =>
    visited.has(route.id) || route.id === activeId ? (
      <section
        key={route.id}
        className={className}
        data-route-cache={route.id}
        data-route-active={route.id === activeId ? "true" : "false"}
        hidden={route.id !== activeId}
      >
        {route.element}
      </section>
    ) : null,
  );
}
