import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { IconName } from "../components/ui/Icon";
import { Icon } from "../components/ui/Icon";
import { useAppStore } from "../store/AppStore";

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
        <Outlet />
      </main>
      <div className={`toast ${toastMessage ? "show" : ""}`}>
        {toastMessage}
      </div>
    </div>
  );
}
