-- CreateTable
CREATE TABLE "AccMemberCache" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccMemberCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccMemberCache_email_key" ON "AccMemberCache"("email");

-- CreateIndex
CREATE INDEX "AccMemberCache_email_idx" ON "AccMemberCache"("email");

-- CreateIndex
CREATE INDEX "AccMemberCache_syncedAt_idx" ON "AccMemberCache"("syncedAt");
