-- CreateEnum
CREATE TYPE "ItineraryEventType" AS ENUM ('CREATED', 'UPDATED', 'HOTEL_ADDED', 'HOTEL_REMOVED', 'FLIGHT_ADDED', 'FLIGHT_REMOVED', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "itinerary_events" (
    "id" TEXT NOT NULL,
    "itineraryId" TEXT NOT NULL,
    "type" "ItineraryEventType" NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itinerary_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "itinerary_events_itineraryId_createdAt_idx" ON "itinerary_events"("itineraryId", "createdAt");

-- AddForeignKey
ALTER TABLE "itinerary_events" ADD CONSTRAINT "itinerary_events_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_events" ADD CONSTRAINT "itinerary_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
