import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import SettingsLayout from "../layouts/SettingsLayout";
import PeoplePage from "../pages/PeoplePage";
import QuestsPage from "../pages/QuestsPage";
import TopiaPage from "../pages/TopiaPage";
import GlassesSettingsPage from "../pages/settings/GlassesSettingsPage";
import IntelligenceSettingsPage from "../pages/settings/IntelligenceSettingsPage";
import MemorySettingsPage from "../pages/settings/MemorySettingsPage";
import TestingSettingsPage from "../pages/settings/TestingSettingsPage";

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

const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/topia", element: <TopiaPage /> },
      { path: "/quests", element: <QuestsPage /> },
      { path: "/people", element: <PeoplePage /> },
      {
        path: "/settings",
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="glasses" replace /> },
          { path: "glasses", element: <GlassesSettingsPage /> },
          { path: "intelligence", element: <IntelligenceSettingsPage /> },
          { path: "memory", element: <MemorySettingsPage /> },
          { path: "testing", element: <TestingSettingsPage /> },
        ],
      },
      { path: "*", element: <Navigate to="/topia" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
