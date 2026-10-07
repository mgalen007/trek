import { AirportEntity } from '../../airports/entities/airport.entity';

export class FlightEntity {
  id: string;
  departureAirportId: string;
  arrivalAirportId: string;
  airline: string;
  flightNumber: string;
  departureAt: Date;
  arrivalAt: Date;
  /** Price per passenger, decimal serialized as a string. */
  price: string;
  /** ISO 4217 currency code. */
  currency: string;
  availableSeats: number;
  createdAt: Date;
  updatedAt: Date;
}

export class FlightWithAirportsEntity extends FlightEntity {
  departureAirport: AirportEntity;
  arrivalAirport: AirportEntity;
}
