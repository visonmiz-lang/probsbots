-- AlterTable
ALTER TABLE "Trading" ADD COLUMN     "aiReasoningAtOpen" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "exitPrice" DOUBLE PRECISION,
ADD COLUMN     "exitReasoning" TEXT,
ADD COLUMN     "finalPnl" DOUBLE PRECISION,
ADD COLUMN     "marketConditionsAtOpen" JSONB,
ADD COLUMN     "positionOutcome" TEXT,
ADD COLUMN     "technicalIndicatorsAtOpen" JSONB;
