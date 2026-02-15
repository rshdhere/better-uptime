-- Create enum for status page custom domain verification
CREATE TYPE "StatusDomainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "StatusPage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusPageMonitor" (
    "statusPageId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusPageMonitor_pkey" PRIMARY KEY ("statusPageId","websiteId")
);

-- CreateTable
CREATE TABLE "StatusPageDomain" (
    "id" TEXT NOT NULL,
    "statusPageId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "verificationStatus" "StatusDomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusPageDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatusPage_slug_key" ON "StatusPage"("slug");

-- CreateIndex
CREATE INDEX "StatusPage_userId_idx" ON "StatusPage"("userId");

-- CreateIndex
CREATE INDEX "StatusPageMonitor_websiteId_idx" ON "StatusPageMonitor"("websiteId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusPageDomain_statusPageId_key" ON "StatusPageDomain"("statusPageId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusPageDomain_hostname_key" ON "StatusPageDomain"("hostname");

-- CreateIndex
CREATE INDEX "StatusPageDomain_verificationStatus_idx" ON "StatusPageDomain"("verificationStatus");

-- AddForeignKey
ALTER TABLE "StatusPage" ADD CONSTRAINT "StatusPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusPageMonitor" ADD CONSTRAINT "StatusPageMonitor_statusPageId_fkey" FOREIGN KEY ("statusPageId") REFERENCES "StatusPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusPageMonitor" ADD CONSTRAINT "StatusPageMonitor_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusPageDomain" ADD CONSTRAINT "StatusPageDomain_statusPageId_fkey" FOREIGN KEY ("statusPageId") REFERENCES "StatusPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
