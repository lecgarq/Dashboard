import "server-only";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMeta = Record<string, unknown> | undefined;
type Serializable =
  | string
  | number
  | boolean
  | null
  | Serializable[]
  | { [key: string]: Serializable };

function serializeError(error: Error): Serializable {
  const output: Record<string, Serializable> = {
    name: error.name,
    message: error.message,
  };

  const maybeCode = (error as Error & { code?: unknown }).code;
  if (typeof maybeCode === "string" || typeof maybeCode === "number") {
    output.code = String(maybeCode);
  }

  if (error.stack) {
    output.stack = error.stack;
  }

  return output;
}

function normalizeValue(value: unknown, seen = new WeakSet<object>()): Serializable {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    const output: Record<string, Serializable> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (typeof nestedValue === "undefined") continue;
      output[key] = normalizeValue(nestedValue, seen);
    }
    seen.delete(value);
    return output;
  }

  return String(value);
}

function writeLog(level: LogLevel, scope: string, message: string, meta?: LogMeta) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta ? { meta: normalizeValue(meta) } : {}),
  };

  const serialized = JSON.stringify(payload);
  switch (level) {
    case "debug":
      console.debug(serialized);
      break;
    case "info":
      console.info(serialized);
      break;
    case "warn":
      console.warn(serialized);
      break;
    case "error":
      console.error(serialized);
      break;
  }
}

export function createLogger(scope: string) {
  return {
    debug(message: string, meta?: LogMeta) {
      if (process.env.NODE_ENV !== "production") {
        writeLog("debug", scope, message, meta);
      }
    },
    info(message: string, meta?: LogMeta) {
      writeLog("info", scope, message, meta);
    },
    warn(message: string, meta?: LogMeta) {
      writeLog("warn", scope, message, meta);
    },
    error(message: string, meta?: LogMeta) {
      writeLog("error", scope, message, meta);
    },
  };
}
