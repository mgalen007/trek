import { Prisma } from '../../generated/prisma/client';
import { totalsByCurrency, tripChanges } from './itinerary-events';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('itinerary events', () => {
  describe('tripChanges', () => {
    const before = {
      name: 'Kigali',
      startDate: d('2030-01-01'),
      endDate: d('2030-01-05'),
    };

    it('lists only the fields that changed, as calendar days', () => {
      expect(
        tripChanges(before, {
          name: 'Kigali',
          startDate: d('2030-01-02'),
          endDate: d('2030-01-05'),
        }),
      ).toEqual({ startDate: { from: '2030-01-01', to: '2030-01-02' } });
    });

    it('ignores a name that was not sent', () => {
      expect(
        tripChanges(before, {
          startDate: before.startDate,
          endDate: before.endDate,
        }),
      ).toEqual({});
    });

    it('records renames', () => {
      expect(tripChanges(before, { ...before, name: 'Rwanda' })).toEqual({
        name: { from: 'Kigali', to: 'Rwanda' },
      });
    });
  });

  it('totalsByCurrency sums per currency as decimal strings', () => {
    expect(
      totalsByCurrency([
        { totalPrice: new Prisma.Decimal('100.10'), currency: 'USD' },
        { totalPrice: new Prisma.Decimal(50), currency: 'RWF' },
        { totalPrice: new Prisma.Decimal('0.25'), currency: 'USD' },
      ]),
    ).toEqual({ USD: '100.35', RWF: '50.00' });
  });
});
