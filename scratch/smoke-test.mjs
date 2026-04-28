import { db } from "./server/db.js";
import { appRouter } from "./server/routers/_app.js";
import { createInnerTRPCContext } from "./server/trpc.js";

async function smokeTest() {
  console.log("--- Smoke Test Start ---");
  
  try {
    console.log("Checking database...");
    const res = await db.$queryRaw`SELECT 1 as result`;
    console.log("Database connected:", res);
  } catch (e) {
    console.error("Database connection failed:", e);
    process.exit(1);
  }

  try {
    console.log("Checking tRPC Router...");
    // Mock context
    const ctx = await createInnerTRPCContext({
      session: null,
      projectId: "test-project",
    });
    
    // Create caller
    const caller = appRouter.createCaller(ctx);
    
    // We won't actually call procedures that require complex auth or real data,
    // but just checking if caller can be created is a good start.
    console.log("tRPC Caller created successfully.");
  } catch (e) {
    console.error("tRPC initialization failed:", e);
    process.exit(1);
  }

  console.log("--- Smoke Test Success ---");
}

smokeTest();
