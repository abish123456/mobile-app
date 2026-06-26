/*
  Warnings:

  - You are about to drop the column `roleId` on the `Admin` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Admin" DROP CONSTRAINT "Admin_roleId_fkey";

-- AlterTable
ALTER TABLE "Admin" DROP COLUMN "roleId";

-- CreateTable
CREATE TABLE "_AdminToAdminRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AdminToAdminRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AdminToAdminRole_B_index" ON "_AdminToAdminRole"("B");

-- AddForeignKey
ALTER TABLE "_AdminToAdminRole" ADD CONSTRAINT "_AdminToAdminRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdminToAdminRole" ADD CONSTRAINT "_AdminToAdminRole_B_fkey" FOREIGN KEY ("B") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
