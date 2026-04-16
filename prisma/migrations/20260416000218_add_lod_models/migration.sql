-- CreateTable
CREATE TABLE "LodFamily" (
    "id" TEXT NOT NULL,
    "nameOfFile" TEXT NOT NULL,
    "familyName" TEXT,
    "finalCategory" TEXT,
    "lodLabel" TEXT,
    "provider" TEXT,
    "caption" TEXT,
    "fullDescription" TEXT,
    "confidenceLevel" TEXT,
    "fileSizeKb" DOUBLE PRECISION,
    "possibleCategories" TEXT[],
    "originalFile" TEXT,
    "imagePath" TEXT,
    "thumbPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LodFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LodEmbedding" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "vector" DOUBLE PRECISION[],

    CONSTRAINT "LodEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LodGraphNode" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "neighbors" INTEGER[],

    CONSTRAINT "LodGraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LodCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT,
    "description" TEXT,
    "subcategories" JSONB,

    CONSTRAINT "LodCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LodSearchCache" (
    "id" TEXT NOT NULL,
    "queryHash" TEXT NOT NULL,
    "expandedQuery" TEXT NOT NULL,
    "resultIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LodSearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApsProjectSearchCache" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "models" JSONB NOT NULL,

    CONSTRAINT "ApsProjectSearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LodFamily_nameOfFile_key" ON "LodFamily"("nameOfFile");

-- CreateIndex
CREATE INDEX "LodFamily_finalCategory_idx" ON "LodFamily"("finalCategory");

-- CreateIndex
CREATE INDEX "LodFamily_lodLabel_idx" ON "LodFamily"("lodLabel");

-- CreateIndex
CREATE INDEX "LodFamily_provider_idx" ON "LodFamily"("provider");

-- CreateIndex
CREATE INDEX "LodFamily_familyName_idx" ON "LodFamily"("familyName");

-- CreateIndex
CREATE UNIQUE INDEX "LodEmbedding_familyId_key" ON "LodEmbedding"("familyId");

-- CreateIndex
CREATE INDEX "LodEmbedding_familyId_idx" ON "LodEmbedding"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "LodGraphNode_familyId_key" ON "LodGraphNode"("familyId");

-- CreateIndex
CREATE INDEX "LodGraphNode_familyId_idx" ON "LodGraphNode"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "LodCategory_name_key" ON "LodCategory"("name");

-- CreateIndex
CREATE INDEX "LodCategory_group_idx" ON "LodCategory"("group");

-- CreateIndex
CREATE UNIQUE INDEX "LodSearchCache_queryHash_key" ON "LodSearchCache"("queryHash");

-- CreateIndex
CREATE INDEX "LodSearchCache_queryHash_idx" ON "LodSearchCache"("queryHash");

-- CreateIndex
CREATE INDEX "ApsProjectSearchCache_fetchedAt_idx" ON "ApsProjectSearchCache"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApsProjectSearchCache_hubId_projectId_key" ON "ApsProjectSearchCache"("hubId", "projectId");

-- AddForeignKey
ALTER TABLE "LodEmbedding" ADD CONSTRAINT "LodEmbedding_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "LodFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LodGraphNode" ADD CONSTRAINT "LodGraphNode_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "LodFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;
