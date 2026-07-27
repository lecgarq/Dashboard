"use client";

import { useEffect, useRef } from "react";
import { useParticleZones } from "@/lib/client/particle-zones";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const CFG = {
  density: 22000,
  minSize: 0.8,
  maxSize: 2.2,
  speed: 0.45,
  maxSpeed: 2.8,
  friction: 0.96,
  connectDist: 100,
  lineWidth: 0.3,
  mouseRadius: 220,
  mousePull: 0.18,
  buffer: 60,
} as const;

const dist = (x1: number, y1: number, x2: number, y2: number) =>
  Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);

class Particle {
  x: number; y: number; vx: number; vy: number; size: number;

  constructor(w: number, h: number) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.vx = (Math.random() - 0.5) * CFG.speed;
    this.vy = (Math.random() - 0.5) * CFG.speed;
    this.size = Math.random() * (CFG.maxSize - CFG.minSize) + CFG.minSize;
  }

  update(w: number, h: number, mx: number | null, my: number | null, zones: DOMRect[]) {
    this.x += this.vx;
    this.y += this.vy;

    for (const zone of zones) {
      if (
        this.x > zone.left - 20 &&
        this.x < zone.right + 20 &&
        this.y > zone.top - 20 &&
        this.y < zone.bottom + 20
      ) {
        const dxL = this.x - zone.left;
        const dxR = zone.right - this.x;
        const dyT = this.y - zone.top;
        const dyB = zone.bottom - this.y;
        const minDist = Math.min(dxL, dxR, dyT, dyB);

        const pushForce = 0.8;
        if (minDist === dxL) this.vx -= pushForce;
        else if (minDist === dxR) this.vx += pushForce;
        else if (minDist === dyT) this.vy -= pushForce;
        else if (minDist === dyB) this.vy += pushForce;
      }
    }

    if (this.x < -CFG.buffer) this.x = w + CFG.buffer;
    if (this.x > w + CFG.buffer) this.x = -CFG.buffer;
    if (this.y < -CFG.buffer) this.y = h + CFG.buffer;
    if (this.y > h + CFG.buffer) this.y = -CFG.buffer;

    if (mx !== null && my !== null) {
      const d = dist(mx, my, this.x, this.y);
      if (d < CFG.mouseRadius && d > 0) {
        const f = ((CFG.mouseRadius - d) / CFG.mouseRadius) * CFG.mousePull;
        this.vx += ((mx - this.x) / d) * f;
        this.vy += ((my - this.y) / d) * f;
      }
    }

    this.vx *= CFG.friction;
    this.vy *= CFG.friction;
  }
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { zones } = useParticleZones();
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // A perpetual requestAnimationFrame field behind every dashboard route. The
    // globals.css reduced-motion rule cannot reach a canvas draw loop, so the
    // effect never starts (and tears down if the preference is switched on).
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    let particles: Particle[] = [];
    const mouse = { x: null as number | null, y: null as number | null };
    let raf: number;

    const init = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * window.devicePixelRatio;
      canvas.height = h * window.devicePixelRatio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      const count = Math.floor((w * h) / CFG.density);
      particles = [];
      for (let i = 0; i < count; i++) particles.push(new Particle(w, h));
    };

    // Cache theme-aware color tokens; re-read on theme change via MutationObserver
    let particleRgb = "15, 23, 42";
    let particleAlpha = 0.12;
    let particleLineAlpha = 0.08;
    const refreshColors = () => {
      const cs = getComputedStyle(document.documentElement);
      particleRgb = cs.getPropertyValue("--particle-rgb").trim() || particleRgb;
      const a = parseFloat(cs.getPropertyValue("--particle-alpha"));
      const la = parseFloat(cs.getPropertyValue("--particle-line-alpha"));
      if (!Number.isNaN(a)) particleAlpha = a;
      if (!Number.isNaN(la)) particleLineAlpha = la;
    };
    refreshColors();
    const themeObserver = new MutationObserver(refreshColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const draw = () => {
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const dotFill = `rgba(${particleRgb}, ${particleAlpha})`;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.update(w, h, mouse.x, mouse.y, zonesRef.current);

        ctx.fillStyle = dotFill;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const d = dist(p.x, p.y, p2.x, p2.y);
          if (d < CFG.connectDist) {
            const alpha = (1 - d / CFG.connectDist) * particleLineAlpha;
            ctx.strokeStyle = `rgba(${particleRgb}, ${alpha})`;
            ctx.lineWidth = CFG.lineWidth;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };

    const onResize = () => { init(); };
    const onMouse = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = null; mouse.y = null; };

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("mouseout", onLeave);

    init();
    draw();

    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("mouseout", onLeave);
    };
  }, [reducedMotion]);

  // Nothing to paint and nothing to drive — drop the element too, so the
  // preference is observable in the DOM rather than only in the frame budget.
  if (reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}
