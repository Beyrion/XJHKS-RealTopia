import { createHashRouter, RouterProvider } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";

const legacyScreenRoutes: Record<string, string> = {
  topia: "/topia",
  quests: "/quests",
  people: "/people",
  settings: "/settings/glasses",
  glasses: "/settings/glasses",
  intelligence: "/settings/intelligence",
  memory: "/settings/memory",
  testing: "/settings/testing",
};

if (!window.location.hash) {
  const screen =
    new URLSearchParams(window.location.search).get("screen") ?? "topia";
  window.location.hash = legacyScreenRoutes[screen] ?? "/topia";
}

const router = createHashRouter([{ path: "*", element: <AppLayout /> }]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
