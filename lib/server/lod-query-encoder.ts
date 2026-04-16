import "server-only";

import { z } from "zod";

import { IntegrationError } from "@/lib/server/integration-errors";
import { createLogger } from "@/lib/server/logger";

const logger = createLogger("lod-query-encoder");
const LOD_QUERY_ENCODER_SERVICE = "LOD Query Encoder";
const DEFAULT_TIMEOUT_MS = 15_000;

const encoderResponseSchema = z.object({
  vector: z.array(z.number()).length(768),
  model: z.string().min(1).optional(),
});

const pipelineStatusSchema = z.object({
  status: z.string().optional(),
  progress: z.number(),
  done: z.number().optional(),
  total: z.number().optional(),
  message: z.string().optional(),
  etr: z.number().optional(),
});

export const LOD_QUERY_ENCODER_VERSION =
  process.env.LOD_QUERY_ENCODER_VERSION?.trim() || "siglip-query-v1";

function getEncoderBaseUrl() {
  const raw = process.env.LOD_QUERY_ENCODER_URL?.trim();
  if (!raw) {
    throw new IntegrationError(
      "LOD engine is not configured.",
      500,
      "config_missing",
      LOD_QUERY_ENCODER_SERVICE,
      { envVar: "LOD_QUERY_ENCODER_URL" }
    );
  }
  return raw.replace(/\/embed-query$/, "");
}

function getEncoderUrl() {
  const base = getEncoderBaseUrl();
  return `${base}/embed-query`;
}

function getBatchUrl() {
  const base = getEncoderBaseUrl();
  return `${base}/process-batch`;
}

function getStatusUrl() {
  const base = getEncoderBaseUrl();
  return `${base}/pipeline-status`;
}

function getTimeoutMs() {
  const raw = Number(process.env.LOD_QUERY_ENCODER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const json = (await response.json()) as { error?: unknown; message?: unknown; detail?: unknown };
      if (typeof json.error === "string" && json.error.trim()) return json.error;
      if (typeof json.message === "string" && json.message.trim()) return json.message;
      if (typeof json.detail === "string" && json.detail.trim()) return json.detail;
    }

    const text = await response.text();
    return text.trim() || `Engine returned HTTP ${response.status}.`;
  } catch {
    return `Engine returned HTTP ${response.status}.`;
  }
}

export async function encodeLodQuery(query: string) {
  const url = getEncoderUrl();
  const controller = new AbortController();
  const timeoutMs = getTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const apiKey = process.env.LOD_QUERY_ENCODER_API_KEY?.trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      const code =
        response.status === 401 || response.status === 403
          ? "config_missing"
          : "unavailable";

      throw new IntegrationError(
        code === "config_missing"
          ? "LOD engine rejected the request. Verify credentials."
          : "LOD engine is unavailable.",
        response.status >= 400 ? response.status : 502,
        code,
        LOD_QUERY_ENCODER_SERVICE,
        {
          message,
          queryLength: query.length,
          url,
        }
      );
    }

    const parsed = encoderResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new IntegrationError(
        "LOD engine returned an invalid response.",
        502,
        "unavailable",
        LOD_QUERY_ENCODER_SERVICE,
        {
          issues: parsed.error.issues,
          url,
        }
      );
    }

    return {
      vector: parsed.data.vector,
      model: parsed.data.model ?? LOD_QUERY_ENCODER_VERSION,
      version: LOD_QUERY_ENCODER_VERSION,
    };
  } catch (error) {
    if (error instanceof IntegrationError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new IntegrationError(
        "LOD engine timed out.",
        504,
        "unavailable",
        LOD_QUERY_ENCODER_SERVICE,
        {
          timeoutMs,
          queryLength: query.length,
          url,
        }
      );
    }

    logger.error("LOD engine request failed", {
      err: error,
      queryLength: query.length,
      url,
    });

    throw new IntegrationError(
      "LOD engine is unavailable.",
      502,
      "unavailable",
      LOD_QUERY_ENCODER_SERVICE,
      {
        queryLength: query.length,
        url,
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function startBatchTraining(params: {
  inputDir: string;
  outputDir: string;
  provider?: string;
  limit?: number;
}) {
  const url = getBatchUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = process.env.LOD_QUERY_ENCODER_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input_dir: params.inputDir,
      output_dir: params.outputDir,
      provider: params.provider,
      limit: params.limit,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const error = await readErrorMessage(response);
    throw new Error(`Failed to start training batch: ${error}`);
  }

  return response.json();
}

export async function getBatchStatus() {
  const url = getStatusUrl();
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to fetch pipeline status: ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = pipelineStatusSchema.safeParse(data);
  if (!parsed.success) {
    if (data.status === "idle") return { status: "idle", progress: 0 };
    throw new Error("Invalid pipeline status format");
  }

  return parsed.data;
}
