import { sampleDataAllowed, scheduleFlights } from './catalogue-seed';
import { DESTINATIONS, ROUTES } from './sample-catalogue';

// A Monday, 12:00 UTC.
const NOW = new Date('2030-01-07T12:00:00Z');

describe('sample catalogue', () => {
  it('flies only between airports in the catalogue', () => {
    const codes = new Set(DESTINATIONS.map((d) => d.airport.code));

    for (const route of ROUTES) {
      expect(codes).toContain(route.from);
      expect(codes).toContain(route.to);
    }
  });

  it('covers Africa, the Middle East, Europe and the Americas', () => {
    const countries = DESTINATIONS.map((d) => d.country);

    for (const country of [
      'Rwanda',
      'United Arab Emirates',
      'France',
      'United States',
      'Brazil',
    ])
      expect(countries).toContain(country);
  });

  describe('scheduleFlights', () => {
    const flights = scheduleFlights(NOW, 7);

    it('schedules only future departures in the window', () => {
      const end = NOW.getTime() + 8 * 24 * 60 * 60 * 1000;
      for (const f of flights) {
        expect(f.departureAt.getTime()).toBeGreaterThan(NOW.getTime());
        expect(f.departureAt.getTime()).toBeLessThan(end);
        expect(f.arrivalAt.getTime()).toBeGreaterThan(f.departureAt.getTime());
      }
    });

    it('flies every route both ways', () => {
      const legs = new Set(flights.map((f) => `${f.from}-${f.to}`));
      for (const route of ROUTES) {
        expect(legs).toContain(`${route.from}-${route.to}`);
        expect(legs).toContain(`${route.to}-${route.from}`);
      }
    });

    it('gives each departure a unique flight number per day', () => {
      const keys = flights.map(
        (f) => `${f.flightNumber}|${f.departureAt.toISOString().slice(0, 10)}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('keeps to the days of the week a route is flown', () => {
      // KGL-ZNZ flies Mondays, Wednesdays and Fridays only.
      const days = flights
        .filter((f) => f.from === 'KGL' && f.to === 'ZNZ')
        .map((f) => f.departureAt.getUTCDay());
      expect(days.length).toBeGreaterThan(0);
      expect(new Set(days)).toEqual(
        new Set(days.filter((d) => [1, 3, 5].includes(d))),
      );
    });

    it('prices the same flight the same way every run', () => {
      const again = scheduleFlights(NOW, 7);
      expect(again.map((f) => f.price)).toEqual(flights.map((f) => f.price));
    });
  });

  it('refuses production unless explicitly allowed', () => {
    expect(sampleDataAllowed({ NODE_ENV: 'development' })).toBe(true);
    expect(sampleDataAllowed({})).toBe(true);
    expect(sampleDataAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(
      sampleDataAllowed({ NODE_ENV: 'production', ALLOW_SAMPLE_DATA: 'true' }),
    ).toBe(true);
  });
});
