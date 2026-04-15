"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Loader2, Box, Info } from "lucide-react";
import { trpc } from "@/lib/trpc";

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

  const { data: tokenData } = trpc.search.getApsToken.useQuery(undefined, {
    refetchInterval: 30 * 60 * 1000, // Token lasts 1hr, refresh at 30min
  });

  const initViewer = () => {
    if (!window.Autodesk || !containerRef.current || !tokenData?.token) return;

    const options = {
      env: "AutodeskProduction2",
      api: "streamingV2",
      getAccessToken: (cb: (token: string, expires: number) => void) => {
        cb(tokenData.token, 3600);
      },
    };

    window.Autodesk.Viewing.Initializer(options, () => {
      const viewer = new window.Autodesk.Viewing.GuiViewer3D(containerRef.current, {
        extensions: ["Autodesk.PropertiesManager"], // Only load property manager
      });
      viewerRef.current = viewer;
      viewer.start();
      
      // Minimalist UI: Hide standard toolbar
      viewer.setTheme("dark-theme");
      
      const documentId = "urn:" + urn;
      window.Autodesk.Viewing.Document.load(
        documentId,
        (doc: any) => {
          const viewables = doc.getRoot().getDefaultGeometry();
          viewer.loadDocumentNode(doc, viewables);
          setIsLoaded(true);
        },
        (err: any) => {
          console.error("Failed to load document:", err);
          setError("Failed to load 3D model.");
        }
      );
    });
  };

  useEffect(() => {
    if (tokenData?.token && window.Autodesk) {
      initViewer();
    }
    return () => {
      if (viewerRef.current) {
        viewerRef.current.finish();
        viewerRef.current = null;
      }
    };
  }, [urn, tokenData]);

  return (
    <div className="relative w-full h-[400px] bg-black/20 rounded-xl overflow-hidden border border-white/10 group">
      <Script
        src="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js"
        onLoad={initViewer}
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
          <p className="text-xs text-muted-foreground mt-1">Check if the translation is complete.</p>
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
