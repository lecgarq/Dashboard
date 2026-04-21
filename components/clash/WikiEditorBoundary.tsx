"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isChunkLoadError } from "@/lib/core/chunk-load-error";
import { clientLogger } from "@/lib/core/logger";

interface State {
  hasError: boolean;
  isChunkError: boolean;
  isDomSyncError: boolean;
  retryKey: number;
  errorMessage: string;
}

export class WikiEditorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, isChunkError: false, isDomSyncError: false, retryKey: 0, errorMessage: "" };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isDomSyncError =
      errorMessage.includes("insertBefore") || errorMessage.includes("is not a child");
    return { hasError: true, isChunkError: isChunkLoadError(error), isDomSyncError, errorMessage };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    clientLogger.error("[WikiEditorBoundary]", error, info);
    // DOM sync errors (ProseMirror decoration race) are transient — auto-recover silently.
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("insertBefore") || msg.includes("is not a child")) {
      setTimeout(() => this.handleRetry(), 150);
    }
  }

  handleRetry = () => {
    this.setState((s) => ({
      hasError: false,
      isChunkError: false,
      isDomSyncError: false,
      retryKey: s.retryKey + 1,
      errorMessage: "",
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
          <AlertCircle className="text-destructive/50 w-8 h-8" />
          <div className="space-y-1 max-w-xs">
            <p className="text-sm font-medium text-foreground">
              {this.state.isChunkError
                ? "Editor failed to load"
                : "Editor encountered an error"}
            </p>
            <p className="text-xs text-muted-foreground">
              {this.state.isChunkError
                ? "The editor bundle could not be downloaded. Click retry — the tunnel connection may have recovered."
                : "An unexpected error occurred in the editor."}
            </p>
            {!this.state.isChunkError && this.state.errorMessage ? (
              <p className="mt-1 rounded bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                {this.state.errorMessage}
              </p>
            ) : null}
          </div>
          <Button size="sm" onClick={this.handleRetry} className="gap-2">
            <RefreshCw size={13} />
            {this.state.isChunkError ? "Retry loading editor" : "Try again"}
          </Button>
        </div>
      );
    }

    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
