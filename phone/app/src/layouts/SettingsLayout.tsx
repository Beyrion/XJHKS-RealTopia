import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { IconName } from "../components/ui/Icon";
import { Icon } from "../components/ui/Icon";

const settings: { to: string; icon: IconName; label: string }[] = [
  { to: "/settings/glasses", icon: "Glasses", label: "眼镜" },
  { to: "/settings/intelligence", icon: "BrainCircuit", label: "智能" },
  { to: "/settings/memory", icon: "Database", label: "记忆" },
  { to: "/settings/testing", icon: "FlaskConical", label: "测试" },
];

export default function SettingsLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
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
        <Outlet />
      </section>
    </div>
  );
}
