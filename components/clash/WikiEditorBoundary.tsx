"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isChunkLoadError } from "@/lib/chunk-load-error";

interface State {
  hasError: boolean;
  isChunkError: boolean;
  retryKey: number;
}

export class WikiEditorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, isChunkError: false, retryKey: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[WikiEditorBoundary]", error, info);
  }

  handleRetry = () => {
    this.setState((s) => ({
      hasError: false,
      isChunkError: false,
      retryKey: s.retryKey + 1,
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
