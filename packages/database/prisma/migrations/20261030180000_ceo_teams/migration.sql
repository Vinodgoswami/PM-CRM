-- D-024: project managers report to a CEO; a CEO sees and manages their own team.
ALTER TABLE "User" ADD COLUMN "managerId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_managerId_idx" ON "User"("managerId");
ALTER TABLE "AuthToken" ADD COLUMN "managerId" TEXT;
