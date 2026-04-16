import "server-only";

import {
  googleApiErrorMessageIncludes,
  hasGoogleApiReason,
  summarizeGoogleApiError,
} from "@/lib/google/oauth";

export type IntegrationErrorCode =
  | "reconnect_required"
  | "config_missing"
  | "unavailable";

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: IntegrationErrorCode,
    readonly service: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

function isConfigErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("not configured") ||
    normalized.includes("missing google") ||
    normalized.includes("missing gmail") ||
    normalized.includes("missing google drive")
  );
}

export function createGoogleIntegrationError(
  service: string,
  error: unknown,
  options: {
    action: string;
    reconnectMessage: string;
    unavailableMessage: string;
    configMessage?: string;
  }
) {
  if (error instanceof IntegrationError) {
    return error;
  }

  const rawMessage = error instanceof Error ? error.message : String(error);

  if (isConfigErrorMessage(rawMessage)) {
    return new IntegrationError(
      options.configMessage ?? `${service} is not configured.`,
      500,
      "config_missing",
      service,
      {
        action: options.action,
        rawMessage,
      }
    );
  }

  const summary = summarizeGoogleApiError(error);
  const requiresReconnect =
    summary.statusCode === 401 ||
    summary.statusCode === 403 ||
    hasGoogleApiReason(
      summary,
      "authError",
      "invalid_grant",
      "insufficientPermissions",
      "insufficient_scope",
      "forbidden"
    ) ||
    googleApiErrorMessageIncludes(
      summary,
      "invalid credentials",
      "invalid_grant",
      "insufficient permission",
      "insufficient authentication scopes"
    );

  if (requiresReconnect) {
    return new IntegrationError(
      options.reconnectMessage,
      summary.statusCode === 403 ? 403 : 401,
      "reconnect_required",
      service,
      {
        action: options.action,
        summary,
      }
    );
  }

  return new IntegrationError(
    options.unavailableMessage,
    summary.statusCode ?? 502,
    "unavailable",
    service,
    {
      action: options.action,
      rawMessage,
      summary,
    }
  );
}

export function getIntegrationErrorResponse(
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof IntegrationError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: fallbackMessage,
      code: "unavailable" as const,
    },
  };
}
