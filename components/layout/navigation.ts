import {
  FolderTree,
  LayoutDashboard,
  LayoutTemplate,
  PieChart,
  Ruler,
  Settings,
  Kanban,
  Network,
  Users,
  type LucideIcon,
} from "lucide-react";

type ModuleKey = "trello" | "lod";

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
  { href: "/forma-proposal", label: "Forma Proposal", icon: FolderTree, group: "Organization" },
  { href: "/users/spatial-graph", label: "Spatial Graph", icon: Network, group: "Organization" },
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
