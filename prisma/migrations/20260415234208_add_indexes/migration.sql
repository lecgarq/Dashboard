-- CreateIndex
CREATE INDEX "ClashTask_status_idx" ON "ClashTask"("status");

-- CreateIndex
CREATE INDEX "ClashTask_dueDate_idx" ON "ClashTask"("dueDate");

-- CreateIndex
CREATE INDEX "ClashTask_updatedAt_idx" ON "ClashTask"("updatedAt");

-- CreateIndex
CREATE INDEX "Family_phase_idx" ON "Family"("phase");

-- CreateIndex
CREATE INDEX "Family_dueDate_idx" ON "Family"("dueDate");

-- CreateIndex
CREATE INDEX "Family_updatedAt_idx" ON "Family"("updatedAt");

-- CreateIndex
CREATE INDEX "SimTask_status_idx" ON "SimTask"("status");

-- CreateIndex
CREATE INDEX "SimTask_dueDate_idx" ON "SimTask"("dueDate");
