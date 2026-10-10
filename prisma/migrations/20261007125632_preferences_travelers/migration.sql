-- CreateTable
CREATE TABLE "user_preferences" (
    "userId" TEXT NOT NULL,
    "homeAirportId" TEXT,
    "currency" TEXT,
    "maxNightlyRate" DECIMAL(65,30),
    "minHotelRating" DECIMAL(65,30),
    "defaultTravelers" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "travelers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "nationality" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travelers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_FlightBookingTravelers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FlightBookingTravelers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "travelers_userId_idx" ON "travelers"("userId");

-- CreateIndex
CREATE INDEX "_FlightBookingTravelers_B_index" ON "_FlightBookingTravelers"("B");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_homeAirportId_fkey" FOREIGN KEY ("homeAirportId") REFERENCES "airports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FlightBookingTravelers" ADD CONSTRAINT "_FlightBookingTravelers_A_fkey" FOREIGN KEY ("A") REFERENCES "itinerary_flight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FlightBookingTravelers" ADD CONSTRAINT "_FlightBookingTravelers_B_fkey" FOREIGN KEY ("B") REFERENCES "travelers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
