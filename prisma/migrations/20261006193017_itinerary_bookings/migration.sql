/*
  Warnings:

  - `hotels.availableRooms` is renamed to `totalRooms` (hand-edited from Prisma's drop + add to keep existing data).
  - Added the required column `currency` to the `itinerary_flight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passengers` to the `itinerary_flight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalPrice` to the `itinerary_flight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitPrice` to the `itinerary_flight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `itinerary_flight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currency` to the `itinerary_hotel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nightlyRate` to the `itinerary_hotel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalPrice` to the `itinerary_hotel` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('HELD', 'CONFIRMED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "itinerary_flight" DROP CONSTRAINT "itinerary_flight_itineraryId_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_hotel" DROP CONSTRAINT "itinerary_hotel_itineraryId_fkey";

-- AlterTable
ALTER TABLE "hotels" RENAME COLUMN "availableRooms" TO "totalRooms";

-- AlterTable
ALTER TABLE "itineraries" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "itinerary_flight" ADD COLUMN     "currency" TEXT NOT NULL,
ADD COLUMN     "passengers" INTEGER NOT NULL,
ADD COLUMN     "status" "BookingStatus" NOT NULL DEFAULT 'HELD',
ADD COLUMN     "totalPrice" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "unitPrice" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "itinerary_hotel" ADD COLUMN     "currency" TEXT NOT NULL,
ADD COLUMN     "nightlyRate" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "status" "BookingStatus" NOT NULL DEFAULT 'HELD',
ADD COLUMN     "totalPrice" DECIMAL(65,30) NOT NULL;

-- CreateIndex
CREATE INDEX "itineraries_userId_idx" ON "itineraries"("userId");

-- CreateIndex
CREATE INDEX "itinerary_hotel_hotelId_checkInDate_checkOutDate_idx" ON "itinerary_hotel"("hotelId", "checkInDate", "checkOutDate");

-- AddForeignKey
ALTER TABLE "itinerary_hotel" ADD CONSTRAINT "itinerary_hotel_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_flight" ADD CONSTRAINT "itinerary_flight_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
