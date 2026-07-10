"use client";

// Drill-down Dialog + user table extracted verbatim from HybridAnalyticsSurface.tsx (SPLIT-04 Task 2).
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import type { DetailFilter } from "./hybridAnalyticsViewTypes";

export interface HybridAnalyticsDrilldownProps {
  detailFilter: DetailFilter | null;
  filteredDetailUsers: BulkAccUser[];
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  visibleCount: number;
  setVisibleCount: (value: number | ((prev: number) => number)) => void;
  onClose: () => void;
}

export function HybridAnalyticsDrilldown({
  detailFilter,
  filteredDetailUsers,
  searchTerm,
  setSearchTerm,
  visibleCount,
  setVisibleCount,
  onClose,
}: HybridAnalyticsDrilldownProps) {
  return (
    <Dialog open={!!detailFilter} onOpenChange={(open) => { if (!open) { onClose(); } }}>
      <DialogContent className="w-[56rem] max-w-[95vw] min-w-[24rem] h-[80vh] max-h-[90vh] min-h-[20rem] resize overflow-hidden flex flex-col bg-background/95 backdrop-blur-md border shadow-2xl p-6 rounded-xl animate-in fade-in zoom-in duration-200">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>{detailFilter?.title || "Drill-Down Details"}</span>
            <Badge variant="secondary" className="font-semibold text-xs py-0.5">
              {filteredDetailUsers.length} {filteredDetailUsers.length === 1 ? "user" : "users"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {detailFilter?.subtitle}
          </DialogDescription>
        </DialogHeader>

        {/* Live Search Input */}
        <div className="relative mb-4">
          <Input
            type="text"
            placeholder="Search by name, email, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-muted/40 border-muted-foreground/20 focus:border-primary/50 text-sm pl-10 h-10 rounded-lg shadow-inner"
          />
          {/* Search Icon */}
          <svg
            className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Scrollable Table Area */}
        <div className="flex-1 min-h-0 overflow-y-auto border rounded-lg bg-card/50 shadow-inner pr-1">
          {filteredDetailUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <svg
                className="h-10 w-10 text-muted-foreground/60 mb-2 stroke-1"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-sm font-medium">No matching users found</p>
              <p className="text-xs text-muted-foreground/80 mt-0.5">Try refining your search terms.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[280px] font-semibold text-xs uppercase tracking-wider">User</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider">Company</TableHead>
                    <TableHead className="text-right font-semibold text-xs uppercase tracking-wider w-[100px]">Projects</TableHead>
                    <TableHead className="text-right font-semibold text-xs uppercase tracking-wider w-[100px]">Admins</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider w-[120px]">Roles</TableHead>
                    <TableHead className="text-right font-semibold text-xs uppercase tracking-wider w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDetailUsers.slice(0, visibleCount).map((u) => {
                    const initials = (u.name ?? "")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2) || "?";

                    const statusVal = u.aggregatedStatus?.toLowerCase() ?? "unknown";
                    const badgeVariant =
                      statusVal === "active" ? "default" :
                      statusVal === "pending" ? "outline" : "destructive";

                    const userRoles = Array.from(new Set([
                      ...(u.allRoles ?? []),
                      ...(u.perProjectRoleNames ?? []),
                      ...u.projects.flatMap((p) => p.roles)
                    ].filter(Boolean))).slice(0, 2);

                    return (
                      <TableRow key={u.email} className="hover:bg-muted/40 transition-colors duration-150">
                        <TableCell className="font-medium py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 text-primary flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0 flex flex-col">
                              <span className="truncate font-semibold text-foreground/90 leading-tight">{u.name || "Unknown User"}</span>
                              <span className="truncate text-xs text-muted-foreground leading-normal mt-0.5">{u.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-xs font-medium text-foreground/80 bg-muted/30 px-2 py-1 rounded border border-muted/55 truncate max-w-[150px] inline-block">
                            {(u.companyName ?? u.companyRole ?? "Unknown").trim() || "Unknown"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold py-3 tabular-nums">
                          {u.projectCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold py-3 tabular-nums text-amber-600 dark:text-amber-400">
                          {u.adminCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {userRoles.length === 0 ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : (
                              userRoles.map((role) => (
                                <Badge key={role} variant="outline" className="text-[10px] px-1.5 py-0 truncate max-w-[80px]">
                                  {role}
                                </Badge>
                              ))
                            )}
                            {userRoles.length < Array.from(new Set([
                              ...(u.allRoles ?? []),
                              ...(u.perProjectRoleNames ?? []),
                              ...u.projects.flatMap((p) => p.roles)
                            ].filter(Boolean))).length && (
                              <span className="text-[9px] text-muted-foreground align-middle font-medium">+more</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-3">
                          <Badge variant={badgeVariant} className="text-[10px] font-bold tracking-wider px-2 py-0.5 uppercase">
                            {u.aggregatedStatus || "UNKNOWN"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filteredDetailUsers.length > visibleCount && (
                <div className="flex justify-center p-4 border-t bg-card/40">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount((prev) => prev + 100)}
                    className="font-medium text-xs shadow-sm"
                  >
                    Load More (showing {visibleCount} of {filteredDetailUsers.length} users)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
