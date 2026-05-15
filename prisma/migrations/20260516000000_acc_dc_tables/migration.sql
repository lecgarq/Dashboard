-- Phase 8: ACC Data Connector snapshot tables (additive only)
-- Generated 2026-05-16 via prisma migrate diff, filtered to AccDc* tables.

-- CreateTable
CREATE TABLE "AccDcUser" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "status" TEXT,
    "companyId" TEXT,
    "autodeskId" TEXT,
    "lastSignIn" TIMESTAMP(3),
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccDcCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hubId" TEXT,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccDcProject" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobNumber" TEXT,
    "status" TEXT,
    "type" TEXT,
    "createdAt" TIMESTAMP(3),
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccDcAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccDcBusinessUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcBusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccDcRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccDcProjectUser" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT,
    "addedOn" TIMESTAMP(3),
    "lastSignIn" TIMESTAMP(3),
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcProjectUser_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "AccDcProjectUserRole" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcProjectUserRole_pkey" PRIMARY KEY ("projectId","userId","roleId")
);

-- CreateTable
CREATE TABLE "AccDcProjectUserProduct" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcProjectUserProduct_pkey" PRIMARY KEY ("projectId","userId","productKey")
);

-- CreateTable
CREATE TABLE "AccDcProjectUserCompany" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcProjectUserCompany_pkey" PRIMARY KEY ("projectId","userId","companyId")
);

-- CreateTable
CREATE TABLE "AccDcProjectUserService" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcProjectUserService_pkey" PRIMARY KEY ("projectId","userId","serviceKey")
);

-- CreateTable
CREATE TABLE "AccDcProjectRole" (
    "projectId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcProjectRole_pkey" PRIMARY KEY ("projectId","roleId")
);

-- CreateTable
CREATE TABLE "AccDcProjectProduct" (
    "projectId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcProjectProduct_pkey" PRIMARY KEY ("projectId","productKey")
);

-- CreateTable
CREATE TABLE "AccDcProjectCompany" (
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcProjectCompany_pkey" PRIMARY KEY ("projectId","companyId")
);

-- CreateTable
CREATE TABLE "AccDcProjectService" (
    "projectId" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcProjectService_pkey" PRIMARY KEY ("projectId","serviceKey")
);

-- CreateTable
CREATE TABLE "AccDcAccountService" (
    "accountId" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "ingestRunId" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcAccountService_pkey" PRIMARY KEY ("accountId","serviceKey")
);

-- CreateTable
CREATE TABLE "AccDcIngestRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "sliceWindowStart" TIMESTAMP(3),
    "sliceWindowEnd" TIMESTAMP(3),
    "projectsProcessed" INTEGER NOT NULL DEFAULT 0,
    "rowsByModule" JSONB NOT NULL,
    "rowsByAdminCsv" JSONB NOT NULL,
    "quotaUsed" INTEGER NOT NULL DEFAULT 0,
    "diffSummary" JSONB,
    "unknownModulesSeen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorMessage" TEXT,

    CONSTRAINT "AccDcIngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccDcBackfillProgress" (
    "projectId" TEXT NOT NULL,
    "earliestCovered" TIMESTAMP(3),
    "latestCovered" TIMESTAMP(3),
    "projectCreatedAt" TIMESTAMP(3) NOT NULL,
    "newProjectFlag" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccDcBackfillProgress_pkey" PRIMARY KEY ("projectId")
);

-- CreateIndex
CREATE INDEX "AccDcUser_email_idx" ON "AccDcUser"("email");

-- CreateIndex
CREATE INDEX "AccDcUser_companyId_idx" ON "AccDcUser"("companyId");

-- CreateIndex
CREATE INDEX "AccDcProject_accountId_idx" ON "AccDcProject"("accountId");

-- CreateIndex
CREATE INDEX "AccDcProjectUser_userId_idx" ON "AccDcProjectUser"("userId");

-- CreateIndex
CREATE INDEX "AccDcIngestRun_startedAt_idx" ON "AccDcIngestRun"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "AccDcIngestRun_status_idx" ON "AccDcIngestRun"("status");
