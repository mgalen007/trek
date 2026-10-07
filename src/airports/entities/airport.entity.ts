export class AirportEntity {
  id: string;
  destinationId: string;
  /** IATA/ICAO code, e.g. KGL. */
  code: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
