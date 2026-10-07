-- CreateIndex
CREATE INDEX "airports_destinationId_idx" ON "airports"("destinationId");

-- CreateIndex
CREATE INDEX "flights_departureAirportId_departureAt_idx" ON "flights"("departureAirportId", "departureAt");

-- CreateIndex
CREATE INDEX "flights_arrivalAirportId_departureAt_idx" ON "flights"("arrivalAirportId", "departureAt");

-- CreateIndex
CREATE INDEX "flights_departureAt_idx" ON "flights"("departureAt");

-- CreateIndex
CREATE INDEX "hotels_destinationId_idx" ON "hotels"("destinationId");
