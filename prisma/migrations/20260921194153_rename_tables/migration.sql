/*
  Warnings:

  - You are about to drop the `Airport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Destination` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Flight` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Hotel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Itinerary` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ItineraryFlight` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ItineraryHotel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Airport" DROP CONSTRAINT "Airport_destinationId_fkey";

-- DropForeignKey
ALTER TABLE "Flight" DROP CONSTRAINT "Flight_arrivalAirportId_fkey";

-- DropForeignKey
ALTER TABLE "Flight" DROP CONSTRAINT "Flight_departureAirportId_fkey";

-- DropForeignKey
ALTER TABLE "Hotel" DROP CONSTRAINT "Hotel_destinationId_fkey";

-- DropForeignKey
ALTER TABLE "Itinerary" DROP CONSTRAINT "Itinerary_destinationId_fkey";

-- DropForeignKey
ALTER TABLE "Itinerary" DROP CONSTRAINT "Itinerary_userId_fkey";

-- DropForeignKey
ALTER TABLE "ItineraryFlight" DROP CONSTRAINT "ItineraryFlight_flightId_fkey";

-- DropForeignKey
ALTER TABLE "ItineraryFlight" DROP CONSTRAINT "ItineraryFlight_itineraryId_fkey";

-- DropForeignKey
ALTER TABLE "ItineraryHotel" DROP CONSTRAINT "ItineraryHotel_hotelId_fkey";

-- DropForeignKey
ALTER TABLE "ItineraryHotel" DROP CONSTRAINT "ItineraryHotel_itineraryId_fkey";

-- DropTable
DROP TABLE "Airport";

-- DropTable
DROP TABLE "Destination";

-- DropTable
DROP TABLE "Flight";

-- DropTable
DROP TABLE "Hotel";

-- DropTable
DROP TABLE "Itinerary";

-- DropTable
DROP TABLE "ItineraryFlight";

-- DropTable
DROP TABLE "ItineraryHotel";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destinations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "description" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotels" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "rating" DECIMAL(65,30),
    "nightlyRate" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "availableRooms" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airports" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flights" (
    "id" TEXT NOT NULL,
    "departureAirportId" TEXT NOT NULL,
    "arrivalAirportId" TEXT NOT NULL,
    "airline" TEXT NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "arrivalAt" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "availableSeats" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itineraries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "ItineraryStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itineraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_hotel" (
    "id" TEXT NOT NULL,
    "itineraryId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkOutDate" TIMESTAMP(3) NOT NULL,
    "rooms" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_flight" (
    "id" TEXT NOT NULL,
    "itineraryId" TEXT NOT NULL,
    "flightId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itinerary_flight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "airports_code_key" ON "airports"("code");

-- AddForeignKey
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "airports" ADD CONSTRAINT "airports_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_departureAirportId_fkey" FOREIGN KEY ("departureAirportId") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_arrivalAirportId_fkey" FOREIGN KEY ("arrivalAirportId") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_hotel" ADD CONSTRAINT "itinerary_hotel_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_hotel" ADD CONSTRAINT "itinerary_hotel_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_flight" ADD CONSTRAINT "itinerary_flight_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_flight" ADD CONSTRAINT "itinerary_flight_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "flights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
