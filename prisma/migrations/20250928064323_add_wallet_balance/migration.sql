/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Entry` table. All the data in the column will be lost.
  - You are about to drop the column `autoLockAt` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `rolledAt` on the `Room` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "Entry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("id", "position", "roomId", "userId") SELECT "id", "position", "roomId", "userId" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_userId_idx" ON "Entry"("userId");
CREATE UNIQUE INDEX "Entry_roomId_position_key" ON "Entry"("roomId", "position");
CREATE TABLE "new_Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "capacity" INTEGER NOT NULL DEFAULT 12,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "finishedAt" DATETIME,
    "prizeCents" INTEGER,
    "winningEntryId" TEXT,
    "preselectedPosition" INTEGER
);
INSERT INTO "new_Room" ("capacity", "createdAt", "finishedAt", "id", "lockedAt", "preselectedPosition", "priceCents", "prizeCents", "state", "title", "winningEntryId") SELECT "capacity", "createdAt", "finishedAt", "id", "lockedAt", "preselectedPosition", "priceCents", "prizeCents", "state", "title", "winningEntryId" FROM "Room";
DROP TABLE "Room";
ALTER TABLE "new_Room" RENAME TO "Room";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "password", "role") SELECT "createdAt", "email", "id", "name", "password", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");
