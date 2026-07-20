"use client";

/**
 * Imperative controller for the Cosmos-native curved similarity web. The component
 * intentionally owns no canvas: the installed GPU renderer receives one ordered
 * ambient/selected/hovered link buffer and remains the only live renderer.
 */

import { useEffect, useRef } from "react";
import type { GraphCanvasHandle } from "./GraphCanvas";
import {
  buildNativeWebBuffers,
  morphOpacityTarget,
  stepOpacity,
  type FocusMatchIndex,
} from "./similarityWeb";

export interface SimilarityWebOverlayProps {
  graphRef: React.RefObject<GraphCanvasHandle | null>;
  mode: "2d" | "3d";
  src: Int32Array;
  dst: Int32Array;
  bucket: Uint16Array;
  strength: Float32Array;
  band: Uint8Array;
  palette: Float32Array;
  opacity: number;
  isMorphing: () => boolean;
  nodeColors?: Float32Array;
  selectedIndex?: number | null;
  selectedMatches?: readonly FocusMatchIndex[];
  hoveredIndex?: number | null;
}

const FRAME_MS = 33;
const EMPTY_MATCHES: readonly FocusMatchIndex[] = [];
const EMPTY = new Float32Array(0);

export function SimilarityWebOverlay(props: SimilarityWebOverlayProps): React.JSX.Element | null {
  const dataRef = useRef(props);
  dataRef.current = props;

  useEffect(() => {
    if (props.mode !== "2d") return;

    let active = true;
    let raf = 0;
    let last = 0;
    let curOpacity = 0;
    let lastHandle: Extract<GraphCanvasHandle, { mode: "2d" }>["handle"] = null;
    let previous: SimilarityWebOverlayProps | null = null;
    let previousMorphing: boolean | null = null;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reducedMotion = media?.matches ?? false;
    const onMotionChange = (): void => { reducedMotion = media?.matches ?? false; };
    media?.addEventListener?.("change", onMotionChange);

    const tick = (ts: number): void => {
      if (!active) return;
      if (ts - last < FRAME_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = last ? ts - last : FRAME_MS;
      last = ts;

      const current = dataRef.current;
      const root = current.graphRef.current;
      const handle = root?.mode === "2d" ? root.handle : null;
      const morphing = current.isMorphing();
      const target = morphOpacityTarget(current.opacity, morphing);
      const nextOpacity = reducedMotion ? target : stepOpacity(curOpacity, target, dt);
      const dataChanged =
        previous === null ||
        current.src !== previous.src ||
        current.dst !== previous.dst ||
        current.bucket !== previous.bucket ||
        current.strength !== previous.strength ||
        current.band !== previous.band ||
        current.palette !== previous.palette ||
        current.nodeColors !== previous.nodeColors ||
        current.selectedIndex !== previous.selectedIndex ||
        current.selectedMatches !== previous.selectedMatches ||
        current.hoveredIndex !== previous.hoveredIndex;
      const needsUpdate =
        !!handle &&
        (handle !== lastHandle ||
          dataChanged ||
          morphing !== previousMorphing ||
          nextOpacity !== curOpacity);

      curOpacity = nextOpacity;
      previous = current;
      previousMorphing = morphing;
      lastHandle = handle;

      if (needsUpdate && handle) {
        const buffers = buildNativeWebBuffers({
          web: {
            src: current.src,
            dst: current.dst,
            strength: current.strength,
            dropped: 0,
          },
          paint: {
            bucket: current.bucket,
            band: current.band,
            palette: current.palette,
          },
          ambientOpacity: curOpacity,
          nodeColors: current.nodeColors,
          selectedIndex: current.selectedIndex ?? null,
          selectedMatches: current.selectedMatches ?? EMPTY_MATCHES,
          hoveredIndex: current.hoveredIndex ?? null,
        });
        handle.setSimilarityLinks(buffers.links, buffers.colors, buffers.widths);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      media?.removeEventListener?.("change", onMotionChange);
      lastHandle?.setSimilarityLinks(EMPTY, EMPTY, EMPTY);
    };
  }, [props.mode]);

  if (props.mode !== "2d") return null;
  return <span data-testid="similarity-web" hidden />;
}
