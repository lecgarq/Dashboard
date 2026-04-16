"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Loader2, Box, Info } from "lucide-react";
import { trpc } from "@/lib/core/trpc";

interface BimViewerProps {
  urn: string;
}

declare global {
  interface Window {
    Autodesk: any;
  }
}

export function BimViewer({ urn }: BimViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const {
    data: tokenData,
    isError: hasTokenError,
    error: tokenError,
  } = trpc.search.getApsToken.useQuery(undefined, {
    refetchInterval: 30 * 60 * 1000, // Token lasts 1hr, refresh at 30min
  });

  useEffect(() => {
    if (!hasTokenError) return;
    setIsLoaded(false);
    setError(tokenError.message ?? "Autodesk connection is required.");
  }, [hasTokenError, tokenError]);

  useEffect(() => {
    if (!tokenData?.token || !scriptLoaded || !window.Autodesk) return;

    const initViewer = () => {
      if (!containerRef.current) return;

      setError(null);
      setIsLoaded(false);

      const options = {
        env: "AutodeskProduction2",
        api: "streamingV2",
        getAccessToken: (cb: (token: string, expires: number) => void) => {
          const expiresIn = tokenData.expiresAt
            ? Math.max(60, tokenData.expiresAt - Math.floor(Date.now() / 1000))
            : 3600;
          cb(tokenData.token, expiresIn);
        },
      };

      window.Autodesk.Viewing.Initializer(options, () => {
        const viewer = new window.Autodesk.Viewing.GuiViewer3D(containerRef.current, {
          extensions: ["Autodesk.PropertiesManager"],
        });
        viewerRef.current = viewer;
        viewer.start();
        viewer.setTheme("dark-theme");

        const documentId = "urn:" + urn;
        window.Autodesk.Viewing.Document.load(
          documentId,
          (doc: any) => {
            const viewables = doc.getRoot().getDefaultGeometry();
            viewer.loadDocumentNode(doc, viewables);
            setIsLoaded(true);
          },
          (_err: any) => {
            setError("Failed to load 3D model.");
          }
        );
      });
    };

    initViewer();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.finish();
        viewerRef.current = null;
      }
    };
  }, [urn, tokenData, scriptLoaded]);

  return (
    <div className="relative w-full h-[400px] bg-black/20 rounded-xl overflow-hidden border border-white/10 group">
      <Script
        src="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js"
        onLoad={() => setScriptLoaded(true)}
      />
      <link
        rel="stylesheet"
        href="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css"
      />

      <div ref={containerRef} className="w-full h-full" />

      {!isLoaded && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Initializing Viewer...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-center">
          <Info className="w-8 h-8 text-destructive mb-2" />
          <p className="text-sm text-foreground font-bold">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {hasTokenError
              ? "Link Autodesk in your account settings and try again."
              : "Check if the translation is complete."}
          </p>
        </div>
      )}

      {/* Manual Minimalist Overlay Controls */}
      {isLoaded && (
        <div className="absolute bottom-4 left-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-smooth">
          <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] text-white flex items-center gap-2">
            <Box size={12} className="text-primary" />
            <span>3D VIEW READY</span>
          </div>
        </div>
      )}
    </div>
  );
}
