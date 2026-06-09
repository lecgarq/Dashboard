import {
  Building2,
  ClipboardCheck,
  LayoutDashboard,
  LayoutTemplate,
  PieChart,
  Ruler,
  Settings,
  Kanban,
  RefreshCw,
  Zap,
  Cpu,
  Network,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ModuleKey = "families" | "clash" | "exam" | "trello" | "lod" | "sim";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  module?: ModuleKey;
  group?: string;
};

export const MODULE_NAV_ITEMS: NavigationItem[] = [
  { href: "/home", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users Directory", icon: Users, group: "Organization" },
  { href: "/access-analysis", label: "Access Analysis", icon: PieChart, group: "Organization" },
  { href: "/template-mty", label: "Template MTY", icon: LayoutTemplate, group: "Organization" },
  { href: "/users/spatial-graph", label: "Spatial Graph", icon: Network, group: "Organization" },
  { href: "/sync-center", label: "Sync Center", icon: RefreshCw, group: "Organization" },
  { href: "/clash-detection", label: "Clash Detection", icon: Zap, module: "clash", group: "Wiki Bar" },
  { href: "/sim-automation", label: "Sim Automation", icon: Cpu, module: "sim", group: "Wiki Bar" },
  { href: "/families", label: "Familias Parametricas", icon: Building2, module: "families", group: "Familias Parametricas" },
  { href: "/exam", label: "Examen Revit", icon: ClipboardCheck, module: "exam", group: "AI Tools" },
  { href: "/lod-checker", label: "LOD Checker", icon: Ruler, module: "lod", group: "AI Tools" },
  { href: "/trello", label: "Trello", icon: Kanban, module: "trello", group: "Integrations" },
];

export const STAFF_NAV_ITEM: NavigationItem = {
  href: "/settings/users",
  label: "Settings",
  icon: Settings,
};

export function isNavItemActive(pathname: string, href: string) {
  if (href === "/users") return pathname === "/users";
  return pathname === href || (href !== "/home" && pathname.startsWith(href));
}
