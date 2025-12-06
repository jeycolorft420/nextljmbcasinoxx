/*
  Warnings:

  - A unique constraint covering the columns `[roomId,position,round]` on the table `Entry` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Entry_roomId_position_key";

-- AlterTable
ALTER TABLE "public"."Entry" ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "currentRound" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "currentServerHash" TEXT,
ADD COLUMN     "currentServerSeed" TEXT;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "selectedRouletteSkin" TEXT,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;

-- CreateTable
CREATE TABLE "public"."GameResult" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "winnerUserId" TEXT,
    "winnerName" TEXT,
    "prizeCents" INTEGER NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "serverSeed" TEXT,
    "serverHash" TEXT,
    "nonce" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RouletteSkin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouletteSkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."License" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "lockedDomain" TEXT,
    "lockedIp" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "features" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemSettings" (
    "id" TEXT NOT NULL,
    "siteName" TEXT NOT NULL DEFAULT '777 Galaxy',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "diceCoverUrl" TEXT,
    "rouletteCoverUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#109e28',
    "secondaryColor" TEXT NOT NULL DEFAULT '#121212',
    "accentColor" TEXT NOT NULL DEFAULT '#2a2a2a',
    "backgroundColor" TEXT NOT NULL DEFAULT '#050505',
    "textColor" TEXT NOT NULL DEFAULT '#f5f5f5',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameResult_roomId_idx" ON "public"."GameResult"("roomId");

-- CreateIndex
CREATE INDEX "RouletteSkin_userId_definitionId_idx" ON "public"."RouletteSkin"("userId", "definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "RouletteSkin_userId_definitionId_key" ON "public"."RouletteSkin"("userId", "definitionId");

-- CreateIndex
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "public"."ChatMessage"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "License_key_key" ON "public"."License"("key");

-- CreateIndex
CREATE INDEX "License_key_idx" ON "public"."License"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_roomId_position_round_key" ON "public"."Entry"("roomId", "position", "round");

-- AddForeignKey
ALTER TABLE "public"."GameResult" ADD CONSTRAINT "GameResult_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RouletteSkin" ADD CONSTRAINT "RouletteSkin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
