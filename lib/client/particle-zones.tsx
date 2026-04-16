"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ZoneMap = Map<string, DOMRect>;

type ParticleZoneContextValue = {
  zones: DOMRect[];
  registerZone: (id: string, rect: DOMRect) => void;
  unregisterZone: (id: string) => void;
};

const ParticleZoneContext = createContext<ParticleZoneContextValue>({
  zones: [],
  registerZone: () => {},
  unregisterZone: () => {},
});

export function ParticleZoneProvider({ children }: { children: React.ReactNode }) {
  const mapRef = useRef<ZoneMap>(new Map());
  const [zones, setZones] = useState<DOMRect[]>([]);

  const registerZone = useCallback((id: string, rect: DOMRect) => {
    mapRef.current.set(id, rect);
    setZones(Array.from(mapRef.current.values()));
  }, []);

  const unregisterZone = useCallback((id: string) => {
    mapRef.current.delete(id);
    setZones(Array.from(mapRef.current.values()));
  }, []);

  return (
    <ParticleZoneContext.Provider value={{ zones, registerZone, unregisterZone }}>
      {children}
    </ParticleZoneContext.Provider>
  );
}

export function useParticleZones() {
  return useContext(ParticleZoneContext);
}

export function useParticleZone(ref: React.RefObject<HTMLElement | null>, id: string) {
  const { registerZone, unregisterZone } = useContext(ParticleZoneContext);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      registerZone(id, el.getBoundingClientRect());
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("scroll", measure, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure);
      unregisterZone(id);
    };
  }, [ref, id, registerZone, unregisterZone]);
}
