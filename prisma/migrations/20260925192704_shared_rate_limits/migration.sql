-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rateLimitBucket" (
    "key" TEXT NOT NULL,
    "hits" TIMESTAMP(3)[],
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "rateLimit_lastRequest_idx" ON "rateLimit"("lastRequest");

-- CreateIndex
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");

-- CreateIndex
CREATE INDEX "rateLimitBucket_expiresAt_idx" ON "rateLimitBucket"("expiresAt");

