-- CreateTable
CREATE TABLE "AccProject" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobNumber" TEXT,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "autodeskId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "companyName" TEXT,
    "phone" TEXT,
    "addedOn" TIMESTAMP(3),
    "lastSignIn" TIMESTAMP(3),
    "projectAdmin" BOOLEAN NOT NULL DEFAULT false,
    "executive" BOOLEAN NOT NULL DEFAULT false,
    "products" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccRole" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccProjectRole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "memberId" TEXT,
    "docsAccessLevel" TEXT,
    "projectAdminAccessLevel" TEXT,

    CONSTRAINT "AccProjectRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccFolder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "fullPath" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccFolderPermission" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "actions" TEXT[],
    "permType" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccFolderPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccActivity" (
    "id" TEXT NOT NULL,
    "autodeskId" TEXT NOT NULL,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "service" TEXT,
    "tool" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccDataConnectorJob" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "serviceGroups" TEXT[],
    "dateRange" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "downloadUrl" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "AccDataConnectorJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncMeta" (
    "id" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccProject_accountId_idx" ON "AccProject"("accountId");

-- CreateIndex
CREATE INDEX "AccProject_status_idx" ON "AccProject"("status");

-- CreateIndex
CREATE INDEX "AccProjectMember_email_idx" ON "AccProjectMember"("email");

-- CreateIndex
CREATE INDEX "AccProjectMember_projectId_idx" ON "AccProjectMember"("projectId");

-- CreateIndex
CREATE INDEX "AccProjectMember_autodeskId_idx" ON "AccProjectMember"("autodeskId");

-- CreateIndex
CREATE UNIQUE INDEX "AccProjectMember_projectId_autodeskId_key" ON "AccProjectMember"("projectId", "autodeskId");

-- CreateIndex
CREATE INDEX "AccRole_accountId_idx" ON "AccRole"("accountId");

-- CreateIndex
CREATE INDEX "AccProjectRole_projectId_idx" ON "AccProjectRole"("projectId");

-- CreateIndex
CREATE INDEX "AccProjectRole_roleId_idx" ON "AccProjectRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "AccProjectRole_projectId_roleId_memberId_key" ON "AccProjectRole"("projectId", "roleId", "memberId");

-- CreateIndex
CREATE INDEX "AccFolder_projectId_idx" ON "AccFolder"("projectId");

-- CreateIndex
CREATE INDEX "AccFolder_parentId_idx" ON "AccFolder"("parentId");

-- CreateIndex
CREATE INDEX "AccFolderPermission_folderId_idx" ON "AccFolderPermission"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "AccFolderPermission_folderId_roleId_key" ON "AccFolderPermission"("folderId", "roleId");

-- CreateIndex
CREATE INDEX "AccActivity_autodeskId_createdAt_idx" ON "AccActivity"("autodeskId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AccActivity_projectId_createdAt_idx" ON "AccActivity"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AccActivity_action_idx" ON "AccActivity"("action");

-- CreateIndex
CREATE UNIQUE INDEX "AccDataConnectorJob_requestId_key" ON "AccDataConnectorJob"("requestId");

-- CreateIndex
CREATE INDEX "AccDataConnectorJob_status_idx" ON "AccDataConnectorJob"("status");

-- CreateIndex
CREATE INDEX "AccDataConnectorJob_startedAt_idx" ON "AccDataConnectorJob"("startedAt");

-- AddForeignKey
ALTER TABLE "AccProjectMember" ADD CONSTRAINT "AccProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AccProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccProjectRole" ADD CONSTRAINT "AccProjectRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AccProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccProjectRole" ADD CONSTRAINT "AccProjectRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AccRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccProjectRole" ADD CONSTRAINT "AccProjectRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "AccProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccFolder" ADD CONSTRAINT "AccFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AccProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccFolderPermission" ADD CONSTRAINT "AccFolderPermission_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AccFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
