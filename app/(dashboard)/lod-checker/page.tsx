"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLoading } from "@/components/ui/BrandLoading";

const LOD_CHECKER_URL =
  process.env.NEXT_PUBLIC_LOD_CHECKER_URL ?? "http://localhost:5173";

export default function LODCheckerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [key, setKey] = useState(0);

  const handleLoad = useCallback(() => {
    setLoading(false);
    setError(false);
  }, []);

  const handleError = useCallback(() => {
    setLoading(false);
    setError(true);
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    setError(false);
    setKey((k) => k + 1);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Header title="LOD Checker" />

      <div className="relative flex-1">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10 animate-in fade-in">
            <BrandLoading message="Synchronizing with LOD services..." />
          </div>
        )}

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <p className="text-lg font-medium">LOD Checker service is unavailable</p>
            <p className="text-sm">
              Make sure the service is running at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {LOD_CHECKER_URL}
              </code>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={retry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={LOD_CHECKER_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open directly
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <iframe
            key={key}
            src={LOD_CHECKER_URL}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
      </div>
    </div>
  );
}
