-- Itineraries are deleted with their user (UsersService blocks this while
-- the user has upcoming confirmed trips, so no reserved inventory is lost).
-- DropForeignKey
ALTER TABLE "itineraries" DROP CONSTRAINT "itineraries_userId_fkey";

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Flight capacity: hand-edited from Prisma's "ADD COLUMN ... NOT NULL" so
-- existing flights get totalSeats = seats still available + seats held by
-- confirmed bookings.
-- AlterTable
ALTER TABLE "flights" ADD COLUMN "totalSeats" INTEGER;

UPDATE "flights" f
SET "totalSeats" = f."availableSeats" + COALESCE((
  SELECT SUM(b."passengers")
  FROM "itinerary_flight" b
  WHERE b."flightId" = f."id" AND b."status" = 'CONFIRMED'
), 0);

ALTER TABLE "flights" ALTER COLUMN "totalSeats" SET NOT NULL;
