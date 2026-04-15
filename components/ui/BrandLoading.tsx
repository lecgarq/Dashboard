"use client";

import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandLoading({ className, message = "Loading mission assets..." }: { className?: string, message?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500",
        className
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
        <div className="relative bg-card p-5 rounded-3xl shadow-soft-xl border border-border/50 animate-scale-in">
          <Cpu className="w-12 h-12 text-primary animate-pulse" />
        </div>
      </div>

      <div className="flex flex-col items-center space-y-3">
        <h2 className="text-2xl font-black text-primary tracking-tighter animate-fade-up">
          MISSION CONTROL
        </h2>
        <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.3em] animate-fade-up [animation-delay:150ms]">
          {message}
        </p>
      </div>

      <div className="w-64 h-1.5 bg-muted/30 rounded-full overflow-hidden relative animate-fade-up [animation-delay:300ms]">
        <div className="absolute inset-0 animate-shimmer" />
      </div>
    </div>
  );
}
