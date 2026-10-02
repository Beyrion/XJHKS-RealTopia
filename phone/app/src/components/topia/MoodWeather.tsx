import type { MoodKind } from "../../models";

export function MoodWeather({ mood }: { mood: MoodKind }) {
  const count = mood === "neutral" ? 0 : 30;
  return (
    <div className={`mood-weather mood-${mood}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <i
          key={index}
          style={
            {
              "--x": `${(index * 37) % 101}%`,
              "--delay": `-${(index % 13) * 0.31}s`,
              "--speed": `${1.1 + (index % 7) * 0.13}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
