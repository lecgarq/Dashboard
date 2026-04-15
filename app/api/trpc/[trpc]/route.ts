import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/root";
import { createTRPCContext } from "@/server/trpc";
import { createLogger } from "@/lib/server/logger";

const logger = createLogger("trpc-route");

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error, type }) =>
            logger.error("tRPC request failed", {
              path: path ?? "<no-path>",
              type,
              error,
            })
        : undefined,
  });

export { handler as GET, handler as POST };
