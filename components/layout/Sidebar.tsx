"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ChevronLeft, Link2, LogOut, MessageCircle, RefreshCw, Search, Unlink, User, X, XCircle } from "lucide-react";

import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";
import { startOAuthConnect } from "@/lib/google/oauth-connect";
import { useParticleZone } from "@/lib/client/particle-zones";
import { cn } from "@/lib/core/utils";
import { MODULE_NAV_ITEMS, STAFF_NAV_ITEM, isNavItemActive } from "./navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/core/trpc";

type AccountModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function startGoogleSignIn(forceConsent = false) {
  startOAuthConnect("google", {
    callbackUrl: window.location.href,
    forceConsent,
  });
}

function startGoogleChatSignIn(forceConsent = false) {
  startOAuthConnect("google-chat", {
    callbackUrl: window.location.href,
    forceConsent,
  });
}

function AccountModal({ open, onOpenChange }: AccountModalProps) {
  const { user, hasGoogle, hasGoogleChat, hasAutodesk } = useDashboardAuth();
  const { update } = useSession();
  const utils = trpc.useUtils();
  const unlink = trpc.users.unlinkAccount.useMutation({
    onSuccess: async () => {
      await update();
    },
  });
  const uploadAvatar = trpc.users.uploadAvatar.useMutation({
    onSuccess: () => utils.invalidate(),
  });
  const deleteAvatar = trpc.users.deleteAvatar.useMutation({
    onSuccess: () => utils.invalidate(),
  });

  const handleAvatarUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert("Image must be under 2 MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          uploadAvatar.mutate({ dataUrl: reader.result });
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle>My Account</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 py-2">
          {/* Avatar with upload/delete */}
          <div className="relative group/avatar shrink-0">
            <button
              onClick={handleAvatarUpload}
              disabled={uploadAvatar.isPending}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-chart-4 flex items-center justify-center ring-2 ring-primary/20 hover:ring-primary/50 transition-smooth overflow-hidden cursor-pointer"
              title="Upload avatar"
            >
              {user?.image ? (
                <img src={user.image} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-base font-bold text-white">
                  {user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
                <Camera size={14} className="text-white" />
              </div>
            </button>
            {/* Delete button */}
            {user?.image && (
              <button
                onClick={() => deleteAvatar.mutate()}
                disabled={deleteAvatar.isPending}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity hover:bg-destructive/80 shadow-md"
                title="Remove avatar"
              >
                <X size={10} />
              </button>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user?.name ?? "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">
            Linked Accounts
          </p>
          <div className="space-y-1.5">
            <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="text-base font-bold text-primary">G</span>
                  <span className="font-medium">Google</span>
                </div>
                {hasGoogle ? (
                  <span className="text-[10px] font-bold text-green-500">LINKED</span>
                ) : (
                  <button
                    onClick={() => startGoogleSignIn()}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-smooth"
                  >
                    <Link2 size={10} />
                    LINK
                  </button>
                )}
              </div>
              {hasGoogle && (
                <button
                  onClick={() => startGoogleSignIn(true)}
                  className="flex items-center gap-1.5 text-[10px] font-semibold text-primary/70 hover:text-primary transition-colors mt-0.5"
                  title="Re-authorize to grant new permissions (Chat, Calendar write, Directory)"
                >
                  <RefreshCw size={10} />
                  Re-authorize Google permissions
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-sm">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  <span className="font-medium">Google Chat</span>
                </div>
                {hasGoogleChat ? (
                  <button
                    onClick={() => unlink.mutate({ provider: "google-chat" })}
                    disabled={unlink.isPending}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-smooth"
                    title="Unlink Google Chat"
                  >
                    <Unlink size={12} />
                    <span className="text-[10px] font-bold">UNLINK</span>
                  </button>
                ) : (
                  <button
                    onClick={() => startGoogleChatSignIn(true)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-smooth"
                  >
                    <Link2 size={10} />
                    LINK
                  </button>
                )}
              </div>
              {hasGoogleChat && (
                <button
                  onClick={() => startGoogleChatSignIn(true)}
                  className="flex items-center gap-1.5 text-[10px] font-semibold text-primary/70 hover:text-primary transition-colors mt-0.5"
                  title="Re-authorize Google Chat permissions"
                >
                  <RefreshCw size={10} />
                  Re-authorize Chat permissions
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 group">
              <div className="flex items-center gap-2.5 text-sm">
                <span className="text-base font-bold text-primary">A</span>
                <span className="font-medium">Autodesk</span>
              </div>
              {hasAutodesk ? (
                <button
                  onClick={() => unlink.mutate({ provider: "autodesk" })}
                  disabled={unlink.isPending}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-smooth opacity-0 group-hover:opacity-100 disabled:opacity-50"
                  title="Unlink Autodesk"
                >
                  <Unlink size={12} />
                  <span className="text-[10px] font-bold">UNLINK</span>
                </button>
              ) : (
                <button
                  onClick={() => signIn("autodesk", { callbackUrl: window.location.href })}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-smooth"
                >
                  <Link2 size={10} />
                  LINK
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-smooth mt-2"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </DialogContent>
    </Dialog>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, isAdmin, hasModuleAccess } = useDashboardAuth();
  const DashboardIcon = MODULE_NAV_ITEMS[0].icon;
  const sidebarRef = useRef<HTMLElement>(null);
  useParticleZone(sidebarRef, "sidebar");

  const visibleNavItems = useMemo(
    () => MODULE_NAV_ITEMS.filter((item) => hasModuleAccess(item.module)),
    [hasModuleAccess]
  );

  const utils = trpc.useUtils();

  const prefetchModule = useCallback(
    (module?: string | null) => {
      switch (module) {
        case "families":
          utils.families.getAll.prefetch();
          break;
        case "clash":
          utils.clash.getWikiSections.prefetch();
          break;
        case "exam":
          utils.exam.getExams.prefetch();
          break;
        case "trello":
          utils.trello.getBoards.prefetch();
          break;
        default:
          utils.kpi.getHomeDashboard.prefetch();
          utils.trello.getMyDueCards.prefetch();
          break;
      }
    },
    [utils]
  );

  useEffect(() => {
    // Only prefetch route JS chunks (lightweight, no data fetching)
    // Data warming happens on hover via prefetchModule
    visibleNavItems.forEach((item) => router.prefetch(item.href));
    if (isAdmin) router.prefetch(STAFF_NAV_ITEM.href);
  }, [isAdmin, router, visibleNavItems]);

  return (
    <>
      <AccountModal open={accountOpen} onOpenChange={setAccountOpen} />
      <aside
        ref={sidebarRef}
        className={cn(
          "surface-panel relative h-full min-h-0 flex flex-col border-r border-white/60 transition-[width] duration-300 ease-in-out",
          "shadow-[0_28px_90px_-44px_rgba(15,23,42,0.55)]",
          collapsed ? "w-[68px]" : "w-[240px]"
        )}
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

        <div className="flex h-20 items-center justify-between border-b border-white/60 px-4 shrink-0">
          {!collapsed ? (
            <div className="flex items-center gap-3 animate-fadeIn">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-1 shadow-[0_18px_36px_-20px_rgba(20,33,61,0.95)] shrink-0">
                <DashboardIcon size={16} className="text-white" />
              </div>
              <div className="leading-tight">
                <span className="font-display text-sm font-semibold tracking-tight text-sidebar-foreground">BIM</span>
                <span className="ml-1 text-sm font-medium text-muted-foreground">Dashboard</span>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Operations shell</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-1 shadow-[0_18px_36px_-20px_rgba(20,33,61,0.95)]">
              <DashboardIcon size={16} className="text-white" />
            </div>
          )}

          {!collapsed && user && (
            <button onClick={() => setAccountOpen(true)} className="relative shrink-0 ml-auto" title="Account">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-4 ring-2 ring-white/70 transition-smooth hover:ring-primary/25">
                {user.image ? (
                  <img src={user.image} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-xs font-bold text-white">
                    {user.name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-sidebar" />
            </button>
          )}

          {collapsed && user && (
            <button onClick={() => setAccountOpen(true)} className="relative mx-auto" title="Account">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-4 ring-2 ring-white/70 transition-smooth hover:ring-primary/25">
                {user.image ? (
                  <img src={user.image} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <User size={12} className="text-white" />
                )}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border-2 border-sidebar" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <div className="mb-2 px-3">
            {!collapsed && (
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.28em]">
                Dashboard
              </span>
            )}
          </div>

          {(() => {
            const dashboardItem = visibleNavItems.find(item => item.href === '/home');
            const otherItems = visibleNavItems.filter(item => item.href !== '/home');

            // Group items by their group property
            const groupedItems: Record<string, typeof visibleNavItems> = {};
            otherItems.forEach(item => {
              const group = item.group || 'Other';
              if (!groupedItems[group]) groupedItems[group] = [];
              groupedItems[group].push(item);
            });

            return (
              <>
                {/* Dashboard always at top */}
                {dashboardItem && (
                  <Link
                    key={dashboardItem.href}
                    href={dashboardItem.href}
                    className={cn(
                      "group relative mb-4 flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-smooth",
                      isNavItemActive(pathname, dashboardItem.href)
                        ? "bg-gradient-to-r from-primary to-chart-1 text-white shadow-[0_18px_40px_-24px_rgba(20,33,61,0.8)]"
                        : "text-muted-foreground hover:bg-white/78 hover:text-primary",
                      collapsed && "justify-center px-2"
                    )}
                    title={collapsed ? dashboardItem.label : undefined}
                  >
                    {isNavItemActive(pathname, dashboardItem.href) && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                    )}
                    <dashboardItem.icon
                      size={18}
                      className={cn(
                        "shrink-0 transition-smooth",
                        isNavItemActive(pathname, dashboardItem.href) ? "text-white" : "text-muted-foreground group-hover:text-primary"
                      )}
                    />
                    {!collapsed && <span className="truncate font-medium">{dashboardItem.label}</span>}
                  </Link>
                )}

                {/* Render grouped items */}
                {Object.entries(groupedItems).map(([groupName, items]) => (
                  <div key={groupName} className="mb-4">
                    {!collapsed && groupName !== 'Other' && (
                      <div className="mb-2 px-3 mt-4">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.28em]">
                          {groupName}
                        </span>
                      </div>
                    )}
                    <div className="space-y-1">
                      {items.map((item) => {
                        const active = isNavItemActive(pathname, item.href);
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onMouseEnter={() => prefetchModule(item.module ?? null)}
                            className={cn(
                              "group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-smooth",
                              active
                                ? "bg-gradient-to-r from-primary to-chart-1 text-white shadow-[0_18px_40px_-24px_rgba(20,33,61,0.8)]"
                                : "text-muted-foreground hover:bg-white/78 hover:text-primary",
                              collapsed && "justify-center px-2"
                            )}
                            title={collapsed ? item.label : undefined}
                          >
                            {active && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                            )}
                            <Icon
                              size={18}
                              className={cn(
                                "shrink-0 transition-smooth",
                                active ? "text-white" : "text-muted-foreground group-hover:text-primary"
                              )}
                            />
                            {!collapsed && <span className="truncate font-medium">{item.label}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            );
          })()}

          {isAdmin && (
            <>
              <div className="mt-4 mb-2 px-3">
                {!collapsed && (
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.28em]">
                    Staff
                  </span>
                )}
              </div>
              <Link
                href={STAFF_NAV_ITEM.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-smooth",
                  pathname === STAFF_NAV_ITEM.href
                    ? "bg-gradient-to-r from-primary to-chart-1 text-white shadow-[0_18px_40px_-24px_rgba(20,33,61,0.8)]"
                    : "text-muted-foreground hover:bg-white/78 hover:text-primary",
                  collapsed && "justify-center px-2"
                )}
                title={collapsed ? STAFF_NAV_ITEM.label : undefined}
              >
                {pathname === STAFF_NAV_ITEM.href && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                )}
                <STAFF_NAV_ITEM.icon
                  size={18}
                  className={cn(
                    "shrink-0 transition-smooth",
                    pathname === STAFF_NAV_ITEM.href
                      ? "text-white"
                      : "text-muted-foreground group-hover:text-sidebar-foreground"
                  )}
                />
                {!collapsed && <span className="truncate font-medium">{STAFF_NAV_ITEM.label}</span>}
              </Link>
            </>
          )}
        </nav>

        <div className="border-t border-white/60 px-3 py-3">
          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className={cn(
              "surface-chip flex w-full items-center gap-2 rounded-full px-3 py-2.5 text-xs font-semibold text-muted-foreground transition-smooth hover:text-primary",
              collapsed && "justify-center px-2"
            )}
          >
            <ChevronLeft size={16} className={cn("transition-transform duration-300 shrink-0", collapsed && "rotate-180")} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
