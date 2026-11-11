import type { PrismaClient } from '../../generated/prisma/client';
import {
  AIRLINES,
  DESTINATIONS,
  ROUTES,
  SampleRoute,
} from './sample-catalogue';

const DAY_MS = 24 * 60 * 60 * 1000;
const TURNAROUND_MINUTES = 90;
const BATCH = 1000;

export interface SeedResult {
  destinations: number;
  airports: number;
  hotels: number;
  flights: number;
}

// Sample data must never land in production by accident: refuse unless
// NODE_ENV isn't production or ALLOW_SAMPLE_DATA=true opts in explicitly.
export const sampleDataAllowed = (env: NodeJS.ProcessEnv) =>
  env.NODE_ENV !== 'production' || env.ALLOW_SAMPLE_DATA === 'true';

/**
 * Adds the sample catalogue: destinations, their airports and hotels, and
 * flights for the next `days` days. Safe to run again: it only creates what
 * is missing (destinations by name and country, airports by code, hotels by
 * name within their destination, flights by number and departure time) and
 * never changes existing records, so admin edits and bookings survive.
 * Running it later tops the flight schedule up to `days` days ahead.
 */
export async function seedCatalogue(
  db: PrismaClient,
  { days = 90, now = new Date() }: { days?: number; now?: Date } = {},
): Promise<SeedResult> {
  const result: SeedResult = {
    destinations: 0,
    airports: 0,
    hotels: 0,
    flights: 0,
  };
  const airportIds = new Map<string, string>();

  for (const sample of DESTINATIONS) {
    let destination = await db.destination.findFirst({
      where: { name: sample.name, country: sample.country },
    });
    if (!destination) {
      destination = await db.destination.create({
        data: {
          name: sample.name,
          city: sample.city,
          country: sample.country,
          description: sample.description,
          latitude: sample.latitude,
          longitude: sample.longitude,
        },
      });
      result.destinations++;
    }

    let airport = await db.airport.findUnique({
      where: { code: sample.airport.code },
    });
    if (!airport) {
      airport = await db.airport.create({
        data: { ...sample.airport, destinationId: destination.id },
      });
      result.airports++;
    }
    airportIds.set(airport.code, airport.id);

    for (const hotel of sample.hotels) {
      const existing = await db.hotel.findFirst({
        where: { destinationId: destination.id, name: hotel.name },
      });
      if (existing) continue;
      await db.hotel.create({
        data: { ...hotel, destinationId: destination.id },
      });
      result.hotels++;
    }
  }

  const flights = scheduleFlights(now, days).filter(
    (f) => airportIds.has(f.from) && airportIds.has(f.to),
  );
  const existing = await db.flight.findMany({
    where: {
      departureAt: {
        gte: now,
        lt: new Date(now.getTime() + days * DAY_MS + DAY_MS),
      },
      flightNumber: { in: [...new Set(flights.map((f) => f.flightNumber))] },
    },
    select: { flightNumber: true, departureAt: true },
  });
  const taken = new Set(
    existing.map((f) => `${f.flightNumber}|${f.departureAt.toISOString()}`),
  );
  const missing = flights.filter(
    (f) => !taken.has(`${f.flightNumber}|${f.departureAt.toISOString()}`),
  );

  for (let i = 0; i < missing.length; i += BATCH) {
    const { count } = await db.flight.createMany({
      data: missing.slice(i, i + BATCH).map((f) => ({
        departureAirportId: airportIds.get(f.from)!,
        arrivalAirportId: airportIds.get(f.to)!,
        airline: f.airline,
        flightNumber: f.flightNumber,
        departureAt: f.departureAt,
        arrivalAt: f.arrivalAt,
        price: f.price,
        currency: f.currency,
        totalSeats: f.seats,
        availableSeats: f.seats,
      })),
    });
    result.flights += count;
  }

  return result;
}

interface ScheduledFlight {
  from: string;
  to: string;
  airline: string;
  flightNumber: string;
  departureAt: Date;
  arrivalAt: Date;
  price: number;
  currency: string;
  seats: number;
}

/** Every departure on the sample routes from `now` until `days` days on. */
export function scheduleFlights(now: Date, days: number): ScheduledFlight[] {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const flights: ScheduledFlight[] = [];

  ROUTES.forEach((route, r) => {
    const legs = [
      { from: route.from, to: route.to, times: route.times.map(toMinutes) },
      {
        from: route.to,
        to: route.from,
        // The aircraft flies back after landing and turning around.
        times: route.times.map(
          (t) => (toMinutes(t) + route.minutes + TURNAROUND_MINUTES) % 1440,
        ),
      },
    ];

    for (let d = 0; d <= days; d++) {
      const date = today + d * DAY_MS;
      const weekday = new Date(date).getUTCDay();
      if (route.days && !route.days.includes(weekday)) continue;

      legs.forEach((leg, direction) => {
        leg.times.forEach((minutes, slot) => {
          const departureAt = new Date(date + minutes * 60_000);
          if (departureAt <= now) return;
          const flightNumber = `${route.airline}${100 + r * 8 + slot * 2 + direction}`;
          flights.push({
            from: leg.from,
            to: leg.to,
            airline: AIRLINES[route.airline].name,
            flightNumber,
            departureAt,
            arrivalAt: new Date(departureAt.getTime() + route.minutes * 60_000),
            price: fare(route, weekday, `${flightNumber}|${date}`),
            currency: AIRLINES[route.airline].currency,
            seats: seatsFor(route.minutes),
          });
        });
      });
    }
  });

  return flights;
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// Fridays and Sundays cost more, and every flight varies a little, but the
// same flight on the same day always gets the same price.
const fare = (route: SampleRoute, weekday: number, key: string) => {
  const busyDay = weekday === 5 || weekday === 0 ? 1.15 : 1;
  const variation = 0.9 + (hash(key) % 21) / 100;
  return Math.round(route.fare * busyDay * variation);
};

const seatsFor = (minutes: number) =>
  minutes < 180 ? 150 : minutes < 420 ? 220 : 300;

const hash = (text: string) => {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
};
