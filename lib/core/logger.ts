"use client";

type ClientLogLevel = "log" | "warn" | "error";

const isDevelopment = process.env.NODE_ENV !== "production";

function emit(level: ClientLogLevel, ...args: unknown[]) {
  if (!isDevelopment) return;
  console[level](...args);
}

export const clientLogger = {
  log: (...args: unknown[]) => emit("log", ...args),
  warn: (...args: unknown[]) => emit("warn", ...args),
  error: (...args: unknown[]) => emit("error", ...args),
};

export function createClientLogger(label: string) {
  const prefix = `[${label}]`;
  return {
    log: (...args: unknown[]) => emit("log", prefix, ...args),
    warn: (...args: unknown[]) => emit("warn", prefix, ...args),
    error: (...args: unknown[]) => emit("error", prefix, ...args),
  };
}
