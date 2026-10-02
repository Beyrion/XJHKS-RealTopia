import type { ReactNode } from "react";

export function SettingCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="s-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
