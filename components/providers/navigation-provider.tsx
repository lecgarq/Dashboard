"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandLoading } from "@/components/ui/BrandLoading";
import { cn } from "@/lib/core/utils";

const NavigationContext = createContext<{
  isNavigating: boolean;
  startNavigation: () => void;
  endNavigation: () => void;
}>({
  isNavigating: false,
  startNavigation: () => {},
  endNavigation: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // End navigation when the route actually changes
  useEffect(() => {
    setIsNavigating(false);
  }, [pathname, searchParams]);

  // Global click listener to intercept internal link clicks
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Find the closest anchor tag
      const target = (e.target as Element).closest("a");
      if (!target || !target.href || target.target === "_blank") return;

      // Ensure it's a standard left-click without modifiers
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;

      try {
        const url = new URL(target.href);
        const currentUrl = new URL(window.location.href);

        // Only intercept internal navigation
        if (url.origin === currentUrl.origin) {
          // Only if it's actually changing routes (not just a hash or same page)
          if (url.pathname !== currentUrl.pathname || url.search !== currentUrl.search) {
            setIsNavigating(true);
          }
        }
      } catch {
        // ignore bad urls
      }
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        isNavigating,
        startNavigation: () => setIsNavigating(true),
        endNavigation: () => setIsNavigating(false),
      }}
    >
      {/* 
        This is an instant overlay that appears exactly when the user clicks a link.
        It hides the Next.js delay and the clunky Suspense boundary flashing.
      */}
      <div
        className={cn(
          "fixed inset-0 z-[99999] flex items-center justify-center bg-background/80 backdrop-blur-md transition-all duration-300",
          isNavigating ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
        )}
      >
        <BrandLoading message="Initializing module..." />
      </div>

      {children}
    </NavigationContext.Provider>
  );
}

