"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClientLogger } from "@/lib/core/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PanelErrorBoundary extends Component<Props, State> {
  private logger = createClientLogger(this.props.label || "PanelErrorBoundary");

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.logger.error("Panel crash detected:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full w-full flex-col items-center justify-center space-y-4 p-8 text-center bg-background/50 backdrop-blur-sm rounded-xl border border-dashed border-destructive/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Panel failed to load</h3>
            <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
              Something went wrong while rendering this component.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className="h-8 gap-2 text-xs"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
