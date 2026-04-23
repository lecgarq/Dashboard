-- CreateTable
CREATE TABLE "AccGraphLayoutCache" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "positions" DOUBLE PRECISION[],
    "dataHash" TEXT NOT NULL,
    "nodeCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccGraphLayoutCache_pkey" PRIMARY KEY ("id")
);
