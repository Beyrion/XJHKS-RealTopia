import { useLocation, useNavigate } from "react-router-dom";
import { KeepAliveRoutes } from "../components/routing/KeepAliveRoutes";
import type { IconName } from "../components/ui/Icon";
import { Icon } from "../components/ui/Icon";
import GlassesSettingsPage from "../pages/settings/GlassesSettingsPage";
import IntelligenceSettingsPage from "../pages/settings/IntelligenceSettingsPage";
import MemorySettingsPage from "../pages/settings/MemorySettingsPage";
import TestingSettingsPage from "../pages/settings/TestingSettingsPage";

const settings: { to: string; icon: IconName; label: string }[] = [
  { to: "/settings/glasses", icon: "Glasses", label: "眼镜" },
  { to: "/settings/intelligence", icon: "BrainCircuit", label: "智能" },
  { to: "/settings/memory", icon: "Database", label: "记忆" },
  { to: "/settings/testing", icon: "FlaskConical", label: "测试" },
];

export default function SettingsLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeSetting = settings.some((item) => item.to === pathname)
    ? pathname
    : "/settings/glasses";
  return (
    <div className="settings">
      <aside className="s-nav">
        <div className="page-head">
          <h1>设置</h1>
        </div>
        <nav>
          {settings.map((item) => (
            <button
              key={item.to}
              data-setting={item.to.slice(item.to.lastIndexOf("/") + 1)}
              className={pathname === item.to ? "active" : ""}
              onClick={() => navigate(item.to)}
            >
              <span className="nav-icon">
                <Icon name={item.icon} />
              </span>
              <span>
                <b>{item.label}</b>
              </span>
              <Icon name="ChevronRight" />
            </button>
          ))}
        </nav>
      </aside>
      <section className="s-content">
        <KeepAliveRoutes
          activeId={activeSetting}
          className="settings-route-cache"
          routes={[
            { id: "/settings/glasses", element: <GlassesSettingsPage /> },
            {
              id: "/settings/intelligence",
              element: <IntelligenceSettingsPage />,
            },
            { id: "/settings/memory", element: <MemorySettingsPage /> },
            { id: "/settings/testing", element: <TestingSettingsPage /> },
          ]}
        />
      </section>
    </div>
  );
}
