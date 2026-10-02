import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { KeepAliveRoutes } from "../components/routing/KeepAliveRoutes";
import type { IconName } from "../components/ui/Icon";
import { Icon } from "../components/ui/Icon";
import PeoplePage from "../pages/PeoplePage";
import QuestsPage from "../pages/QuestsPage";
import TopiaPage from "../pages/TopiaPage";
import { useAppStore } from "../store/AppStore";
import SettingsLayout from "./SettingsLayout";

const tabs: { to: string; id: string; icon: IconName; label: string }[] = [
  { to: "/topia", id: "topia", icon: "House", label: "Topia" },
  { to: "/quests", id: "quests", icon: "ListTodo", label: "任务" },
  { to: "/people", id: "people", icon: "UsersRound", label: "人物" },
  { to: "/settings/glasses", id: "settings", icon: "Settings2", label: "设置" },
];

export default function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { quests, session, toastMessage } = useAppStore();
  const activeRoute = pathname.startsWith("/settings")
    ? "settings"
    : pathname === "/quests"
      ? "quests"
      : pathname === "/people"
        ? "people"
        : "topia";

  useEffect(() => {
    if (pathname === "/settings")
      navigate("/settings/glasses", { replace: true });
    else if (
      !["/topia", "/quests", "/people"].includes(pathname) &&
      !pathname.startsWith("/settings/")
    )
      navigate("/topia", { replace: true });
  }, [navigate, pathname]);

  return (
    <div className="shell">
      <header className="top">
        <button
          className="brand"
          data-tab="topia"
          onClick={() => navigate("/topia")}
        >
          <span className="brand-mark">
            <Icon name="Orbit" />
          </span>
          <span>
            <b>RealTopia</b>
          </span>
        </button>
        <nav>
          {tabs.map((tab) => {
            const active =
              tab.id === "settings"
                ? pathname.startsWith("/settings")
                : pathname === tab.to;
            return (
              <button
                key={tab.id}
                data-tab={tab.id}
                className={active ? "active" : ""}
                onClick={() => navigate(tab.to)}
              >
                <Icon name={tab.icon} />
                <span>{tab.label}</span>
                {tab.id === "quests" && (
                  <em>{quests.filter((item) => item.progress < 100).length}</em>
                )}
              </button>
            );
          })}
        </nav>
        <div className="system">
          <b>12级</b>
          <i className={session.phase} />
          <span>
            {new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </header>
      <main className="body">
        <KeepAliveRoutes
          activeId={activeRoute}
          routes={[
            { id: "topia", element: <TopiaPage /> },
            { id: "quests", element: <QuestsPage /> },
            { id: "people", element: <PeoplePage /> },
            { id: "settings", element: <SettingsLayout /> },
          ]}
        />
      </main>
      <div className={`toast ${toastMessage ? "show" : ""}`}>
        {toastMessage}
      </div>
    </div>
  );
}
