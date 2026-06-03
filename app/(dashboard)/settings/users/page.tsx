"use client";

import { trpc } from "@/lib/core/trpc";
import {
  Users,
  Shield,
  ShieldAlert,
  User as UserIcon,
  MoreHorizontal,
  Search,
  Check,
  Clock,
  CheckCircle2,
  XCircle,
  Building2,
  Zap,
  ClipboardCheck,
  Kanban,
  Ruler,
  Cpu,
  MessageCircle,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useEventSource } from "@/hooks/use-event-source";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/core/utils";
import { useSession } from "next-auth/react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const ROLE_CONFIG = {
  ADMIN:  { label: "Admin",  icon: ShieldAlert, color: "text-red-500 dark:text-red-400",   bg: "bg-red-500/10 border-red-500/20 dark:bg-red-950/30 dark:border-red-900/40" },
  EDITOR: { label: "Editor", icon: Shield,      color: "text-blue-500 dark:text-blue-400", bg: "bg-blue-500/10 border-blue-500/20 dark:bg-blue-950/30 dark:border-blue-900/40" },
  VIEWER: { label: "Viewer", icon: UserIcon,    color: "text-muted-foreground",            bg: "bg-muted/40 border-border" },
};

type Role = keyof typeof ROLE_CONFIG;

const MODULES = [
  { key: "families", label: "Familias",  icon: Building2      },
  { key: "clash",    label: "Clash",     icon: Zap            },
  { key: "exam",     label: "Exam",      icon: ClipboardCheck },
  { key: "trello",   label: "Trello",    icon: Kanban         },
  { key: "lod",      label: "LOD",       icon: Ruler          },
  { key: "sim",      label: "Sim",       icon: Cpu            },
];

// ─── Module Access Row ──────────────────────────────────────────────────────

function ModuleAccessRow({ userId }: { userId: string }) {
  const utils = trpc.useUtils();
  const { data: currentModules = [] } = trpc.users.getUserModuleAccess.useQuery({ userId }, { enabled: !!userId });

  const setModules = trpc.users.setUserModuleAccess.useMutation({
    onMutate: async ({ userId: uid, modules }) => {
      await utils.users.getUserModuleAccess.cancel({ userId: uid });
      const prev = utils.users.getUserModuleAccess.getData({ userId: uid });
      utils.users.getUserModuleAccess.setData({ userId: uid }, modules);
      return { prev };
    },
    onError: (_, { userId: uid }, ctx) => {
      utils.users.getUserModuleAccess.setData({ userId: uid }, ctx?.prev ?? []);
    },
    onSettled: (_, __, { userId: uid }) => {
      utils.users.getUserModuleAccess.invalidate({ userId: uid });
    },
  });

  function toggle(mod: string) {
    const next = currentModules.includes(mod)
      ? currentModules.filter((m) => m !== mod)
      : [...currentModules, mod];
    setModules.mutate({ userId, modules: next });
  }

  return (
    <div className="flex flex-col gap-2.5 py-1">
      {MODULES.map((m) => {
        const active = currentModules.includes(m.key);
        const Icon = m.icon;
        return (
          <div key={m.key} className="flex items-center justify-between gap-4 group/mod">
            <div className="flex items-center gap-2">
              <div className={cn(
                "p-1 rounded-md transition-colors",
                active ? "bg-primary/10 text-primary" : "bg-white/5 text-muted-foreground/40 group-hover/mod:text-muted-foreground"
              )}>
                <Icon className="w-3 h-3" />
              </div>
              <span className={cn(
                "text-[11px] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground/60"
              )}>
                {m.label}
              </span>
            </div>
            <button
              onClick={() => toggle(m.key)}
              aria-label={`Toggle ${m.label} access`}
              className={cn(
                "relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
                active ? "bg-primary" : "bg-white/10"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none block h-3 w-3 rounded-full bg-white shadow-lg ring-0 transition-transform",
                  active ? "translate-x-3" : "translate-x-0"
                )}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Pending Requests Panel ─────────────────────────────────────────────────

function PendingPanel() {
  const utils = trpc.useUtils();
  const { data: pending = [], isLoading } = trpc.users.getPendingRequests.useQuery();
  const approve = trpc.users.approvePendingRequest.useMutation({
    onMutate: async ({ email }) => {
      await utils.users.getPendingRequests.cancel();
      const prev = utils.users.getPendingRequests.getData();
      utils.users.getPendingRequests.setData(undefined, (current = []) =>
        current.filter((r) => r.email.toLowerCase() !== email.toLowerCase())
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) utils.users.getPendingRequests.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      utils.users.getPendingRequests.invalidate();
      utils.users.getAll.invalidate();
    },
  });
  const decline = trpc.users.declinePendingRequest.useMutation({
    onMutate: async ({ email }) => {
      await utils.users.getPendingRequests.cancel();
      const prev = utils.users.getPendingRequests.getData();
      utils.users.getPendingRequests.setData(undefined, (current = []) =>
        current.filter((r) => r.email.toLowerCase() !== email.toLowerCase())
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) utils.users.getPendingRequests.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      utils.users.getPendingRequests.invalidate();
      utils.users.getBlacklistedRequests.invalidate();
    },
  });

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Email</th>
              <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Name</th>
              <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Provider</th>
              <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Requested</th>
              <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : pending.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                  No pending requests.
                </td>
              </tr>
            ) : (
              pending.map((req: any) => (
                <tr key={req.id} className="group hover:bg-white/[0.01] transition-smooth text-sm">
                  <td className="px-6 py-4 font-medium text-foreground">{req.email}</td>
                  <td className="px-6 py-4 text-muted-foreground">{req.name || "—"}</td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="text-xs capitalize border-white/10">
                      {req.provider}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {new Date(req.requestedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 text-xs">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                        disabled={approve.isPending || decline.isPending}
                        onClick={() => approve.mutate({ email: req.email })}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        disabled={approve.isPending || decline.isPending}
                        onClick={() => decline.mutate({ email: req.email })}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Blacklist
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlacklistPanel() {
  const utils = trpc.useUtils();
  const { data: blacklisted = [], isLoading } = trpc.users.getBlacklistedRequests.useQuery();
  const restore = trpc.users.restoreBlacklistedRequest.useMutation({
    onMutate: async ({ email }) => {
      await utils.users.getBlacklistedRequests.cancel();
      const prev = utils.users.getBlacklistedRequests.getData();
      utils.users.getBlacklistedRequests.setData(undefined, (current = []) =>
        current.filter((r) => r.email.toLowerCase() !== email.toLowerCase())
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) utils.users.getBlacklistedRequests.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      utils.users.getBlacklistedRequests.invalidate();
      utils.users.getPendingRequests.invalidate();
    },
  });

  return (
    <div className="glass-card overflow-hidden border-red-500/10">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 bg-red-500/[0.02]">
              <th className="px-6 py-4 text-xs font-semibold text-red-400/70 uppercase tracking-widest">Email</th>
              <th className="px-6 py-4 text-xs font-semibold text-red-400/70 uppercase tracking-widest">Name</th>
              <th className="px-6 py-4 text-xs font-semibold text-red-400/70 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : blacklisted.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">No users in blacklist.</td>
              </tr>
            ) : (
              blacklisted.map((req: any) => (
                <tr key={req.id} className="group hover:bg-red-500/[0.01] transition-smooth text-sm">
                  <td className="px-6 py-4 font-medium text-foreground">{req.email}</td>
                  <td className="px-6 py-4 text-muted-foreground">{req.name || "—"}</td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5 text-primary hover:bg-primary/10"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate({ email: req.email })}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Restore
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"users" | "pending" | "blacklist">("users");
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const { data: users = [] as any[], isLoading } = trpc.users.getAll.useQuery(undefined, { staleTime: Infinity });
  const { data: pendingList = [] } = trpc.users.getPendingRequests.useQuery(undefined, { staleTime: Infinity });
  const { data: blacklistList = [] } = trpc.users.getBlacklistedRequests.useQuery(undefined, { staleTime: Infinity });
  
  const utils = trpc.useUtils();

  const handleUserEvent = useCallback(() => {
    utils.users.getAll.invalidate();
    utils.users.getPendingRequests.invalidate();
    utils.users.getBlacklistedRequests.invalidate();
  }, [utils]);
  useEventSource("/api/events/users", handleUserEvent);

  const updateRole = trpc.users.updateRole.useMutation({
    onMutate: async ({ userId, role }) => {
      await utils.users.getAll.cancel();
      const prev = utils.users.getAll.getData();
      utils.users.getAll.setData(undefined, (current: any[] = []) =>
        current.map((u) => u.id === userId ? { ...u, role } : u)
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) utils.users.getAll.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      utils.users.getAll.invalidate();
      utils.users.getUserModuleAccess.invalidate();
    },
  });
  
  const removeUser = trpc.users.removeAndBlacklistUser.useMutation({
    onMutate: async ({ userId }) => {
      await utils.users.getAll.cancel();
      const prev = utils.users.getAll.getData();
      utils.users.getAll.setData(undefined, (current: any[] = []) =>
        current.filter((u) => u.id !== userId)
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) utils.users.getAll.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      utils.users.getAll.invalidate();
      utils.users.getBlacklistedRequests.invalidate();
    },
  });

  const removeAccount = trpc.users.removeAccount.useMutation({
    onSuccess: () => {
      setSelectedUser(null);
      utils.users.getAll.invalidate();
    },
  });

  const blacklistMember = trpc.users.blacklistMember.useMutation({
    onSuccess: () => {
      setSelectedUser(null);
      utils.users.getAll.invalidate();
      utils.users.getBlacklistedRequests.invalidate();
    },
  });

  const { data: session } = useSession();
  const isPrimaryAdmin = Boolean(session?.user?.isPrimaryAdmin);

  const filteredUsers = users?.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">User Management</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10">
        <button
          onClick={() => setTab("users")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-smooth",
            tab === "users"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="w-4 h-4" />
          Users
        </button>
        <button
          onClick={() => setTab("pending")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-smooth",
            tab === "pending"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Clock className="w-4 h-4" />
          Pending Requests
          {pendingList.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {pendingList.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("blacklist")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-smooth",
            tab === "blacklist"
              ? "border-red-500 text-red-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <ShieldAlert className="w-4 h-4" />
          Blacklist
          {blacklistList.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
              {blacklistList.length}
            </span>
          )}
        </button>
      </div>

      {tab === "pending" && <PendingPanel />}
      {tab === "blacklist" && <BlacklistPanel />}

      {tab === "users" && (
        <>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-9 bg-background/50 border-white/10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">User</th>
                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Role</th>
                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Module Access</th>
                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          Loading users...
                        </div>
                      </td>
                    </tr>
                  ) : filteredUsers?.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                        No users found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers?.map((user) => {
                      const role = user.role as Role;
                      const config = ROLE_CONFIG[role] || ROLE_CONFIG.VIEWER;
                      const Icon = config.icon;

                      return (
                        <tr key={user.id} className="group hover:bg-white/[0.01] transition-smooth text-sm">
                          <td className="px-6 py-4">
                            <div 
                              className="flex items-center gap-3 cursor-pointer group/user"
                              onClick={() => setSelectedUser(user)}
                            >
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 overflow-hidden group-hover/user:border-primary/50 transition-colors">
                                {user.image ? (
                                  <img src={user.image} alt={user.name || ""} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs font-bold text-primary">
                                    {user.name?.charAt(0) || user.email.charAt(0)}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground group-hover/user:text-primary transition-colors">{user.name || "Unknown User"}</span>
                                <span className="text-xs text-muted-foreground">{user.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="outline" className={cn("gap-1.5 py-1 px-2.5 font-medium", config.bg, config.color)}>
                              <Icon className="w-3 h-3" />
                              {config.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            {role === "ADMIN" ? (
                              <span className="text-xs text-muted-foreground italic">All modules (admin)</span>
                            ) : (
                              <ModuleAccessRow userId={user.id} />
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 glass-card border-white/10">
                                <DropdownMenuLabel>Change Role</DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-white/5" />
                                {(Object.keys(ROLE_CONFIG) as Role[])
                                  .filter(r => r !== "ADMIN" || isPrimaryAdmin)
                                  .map((r) => (
                                    <DropdownMenuItem
                                      key={r}
                                      className="gap-2"
                                      onClick={() => updateRole.mutate({ userId: user.id, role: r })}
                                      disabled={updateRole.isPending || user.isPrimaryAdmin}
                                    >
                                      {r === user.role && <Check className="w-3 h-3 text-primary ml-auto order-last" />}
                                      {ROLE_CONFIG[r].label}
                                    </DropdownMenuItem>
                                  ))}
                                
                                <DropdownMenuSeparator className="bg-white/5" />
                                <DropdownMenuItem
                                  className="gap-2 text-amber-500 focus:text-amber-400 focus:bg-amber-500/10"
                                  disabled={blacklistMember.isPending || user.isPrimaryAdmin}
                                  onClick={() => {
                                    if (confirm(`Blacklist ${user.email}? They will be removed and blocked from requesting access.`)) {
                                      blacklistMember.mutate({ userId: user.id });
                                    }
                                  }}
                                >
                                  <ShieldAlert className="w-4 h-4" />
                                  Blacklist Member
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10"
                                  disabled={removeAccount.isPending || user.isPrimaryAdmin}
                                  onClick={() => {
                                    if (confirm(`Completely remove ${user.email}? All records will be deleted.`)) {
                                      removeAccount.mutate({ userId: user.id });
                                    }
                                  }}
                                >
                                  <XCircle className="w-4 h-4" />
                                  Remove Account
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {/* User Details Drawer */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] glass-card border-l border-white/10 p-0 overflow-y-auto">
          {selectedUser && (
            <div className="flex flex-col h-full bg-background/50 backdrop-blur-3xl animate-in slide-in-from-right duration-500">
              <div className="p-8 pb-4">
                <SheetHeader className="space-y-4">
                  <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 overflow-hidden mx-auto shadow-2xl shadow-primary/20 animate-in zoom-in-50 duration-700">
                    {selectedUser.image ? (
                      <img src={selectedUser.image} alt={selectedUser.name || ""} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-primary">
                        {selectedUser.name?.charAt(0) || selectedUser.email.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-center">
                    <SheetTitle className="text-2xl font-bold tracking-tight">{selectedUser.name || "Unknown User"}</SheetTitle>
                    <p className="text-muted-foreground">{selectedUser.email}</p>
                  </div>
                  <div className="flex justify-center gap-2">
                    <Badge variant="outline" className={cn("gap-1.5 py-1 px-3 font-medium", ROLE_CONFIG[selectedUser.role as Role]?.bg, ROLE_CONFIG[selectedUser.role as Role]?.color)}>
                      {ROLE_CONFIG[selectedUser.role as Role]?.label}
                    </Badge>
                  </div>
                </SheetHeader>
              </div>

              <Separator className="bg-white/5" />

              <div className="p-8 space-y-8 flex-1">
                {/* Linked Accounts */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Linked Accounts
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: "google", label: "Google", icon: Shield },
                      { key: "google-chat", label: "Google Chat", icon: MessageCircle },
                      { key: "autodesk", label: "Autodesk", icon: Zap },
                    ].map(({ key, label, icon: ProviderIcon }) => {
                      const isLinked = selectedUser.accounts?.some((a: any) => a.provider === key);
                      return (
                        <div key={key} className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border transition-all duration-300",
                          isLinked 
                            ? "bg-green-500/5 border-green-500/20 text-green-400" 
                            : "bg-white/5 border-white/5 text-muted-foreground/50"
                        )}>
                          <ProviderIcon className="w-4 h-4" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">{label}</span>
                            <span className="text-[10px]">{isLinked ? "Connected" : "Not linked"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Activity Timestamps */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Activity
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <span className="text-xs text-muted-foreground">Joined</span>
                      <span className="text-xs font-medium">{new Date(selectedUser.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <span className="text-xs text-muted-foreground">Last Login</span>
                      <span className="text-xs font-medium">
                        {selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : "Never"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Module Access */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Module Permissions
                  </h3>
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    {selectedUser.role === "ADMIN" ? (
                      <p className="text-xs text-muted-foreground italic text-center py-2">Administrator has full access to all modules.</p>
                    ) : (
                      <ModuleAccessRow userId={selectedUser.id} />
                    )}
                  </div>
                </div>
              </div>

              {/* Destructive Footer */}
              <div className="p-8 mt-auto bg-gradient-to-t from-red-500/5 to-transparent border-t border-white/5 space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white group gap-2 h-11"
                  disabled={blacklistMember.isPending || selectedUser.isPrimaryAdmin}
                  onClick={() => {
                    if (confirm(`Blacklist ${selectedUser.email}? They will be banned permanently.`)) {
                      blacklistMember.mutate({ userId: selectedUser.id });
                    }
                  }}
                >
                  <ShieldAlert className="w-4 h-4 group-hover:animate-pulse" />
                  Blacklist Member
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 gap-2 h-11"
                  disabled={removeAccount.isPending || selectedUser.isPrimaryAdmin}
                  onClick={() => {
                    if (confirm(`Completely delete ${selectedUser.email}? This action cannot be undone.`)) {
                      removeAccount.mutate({ userId: selectedUser.id });
                    }
                  }}
                >
                  <XCircle className="w-4 h-4" />
                  Remove Account
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
