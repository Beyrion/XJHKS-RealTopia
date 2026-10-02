import {
  AudioLines,
  Bluetooth,
  BrainCircuit,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CloudRain,
  Database,
  Download,
  FlaskConical,
  Gift,
  Glasses,
  Heart,
  House,
  Leaf,
  Link,
  ListTodo,
  Mic,
  Orbit,
  Radio,
  RefreshCw,
  ScanFace,
  Search,
  Settings2,
  ShieldCheck,
  Telescope,
  Trash2,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";

export const icons = {
  AudioLines,
  Bluetooth,
  BrainCircuit,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CloudRain,
  Database,
  Download,
  FlaskConical,
  Gift,
  Glasses,
  Heart,
  House,
  Leaf,
  Link,
  ListTodo,
  Mic,
  Orbit,
  Radio,
  RefreshCw,
  ScanFace,
  Search,
  Settings2,
  ShieldCheck,
  Telescope,
  Trash2,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  const Glyph = icons[name];
  return (
    <Glyph
      className={`ui-icon ${className}`.trim()}
      data-lucide={name}
      strokeWidth={2.25}
      aria-hidden="true"
    />
  );
}
