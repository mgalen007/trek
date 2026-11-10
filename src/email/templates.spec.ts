import { escapeHtml, itineraryConfirmedEmail, welcomeEmail } from './templates';

const trip = {
  name: 'Gorillas <b>&</b> lakes',
  destination: 'Kigali',
  startDate: '2030-01-01',
  endDate: '2030-01-05',
};

describe('email templates', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('escapes user-supplied values in HTML but not in text', () => {
    const email = welcomeEmail('<script>alert(1)</script>', { code: 'abc' });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.text).toContain('Hi <script>alert(1)</script>,');
  });

  it('shows a code, or a link when the app URL is known', () => {
    const withCode = welcomeEmail('Ada', { code: 'abc123' });
    expect(withCode.text).toContain('Your code: abc123');

    const withLink = welcomeEmail('Ada', {
      code: 'abc123',
      link: 'https://app.trek.test/verify-email?token=abc123&x="y"',
    });
    expect(withLink.text).toContain(
      'Verify your email address: https://app.trek.test/verify-email?token=abc123',
    );
    expect(withLink.html).toContain(
      'href="https://app.trek.test/verify-email?token=abc123&amp;x=&quot;y&quot;"',
    );
  });

  it('lists every stay, flight and total of a confirmed trip', () => {
    const email = itineraryConfirmedEmail(
      'Ada',
      trip,
      [
        {
          hotelName: 'Hill View',
          checkInDate: '2030-01-01',
          checkOutDate: '2030-01-03',
          rooms: 2,
          totalPrice: '400.00',
          currency: 'USD',
        },
      ],
      [
        {
          flightNumber: 'WB101',
          airline: 'RwandAir',
          departureAt: '2030-01-01T08:30:00.000Z',
          passengers: 2,
          totalPrice: '500.00',
          currency: 'USD',
        },
      ],
      { USD: '900.00', RWF: '1000.00' },
    );

    expect(email.template).toBe('ITINERARY_CONFIRMED');
    expect(email.subject).toBe('Booked: Gorillas <b>&</b> lakes');
    expect(email.text).toContain(
      '- Hill View: 2030-01-01 to 2030-01-03, 2 room(s), 400.00 USD',
    );
    expect(email.text).toContain(
      '- RwandAir WB101, departs 2030-01-01 08:30 UTC, 2 passenger(s), 500.00 USD',
    );
    expect(email.text).toContain('Total: 900.00 USD + 1000.00 RWF');
    expect(email.html).toContain('Gorillas &lt;b&gt;&amp;&lt;/b&gt; lakes');
    expect(email.html).not.toContain('<b>&</b>');
  });

  it('leaves out empty sections', () => {
    const email = itineraryConfirmedEmail('Ada', trip, [], [], {});

    expect(email.text).not.toContain('Hotels:');
    expect(email.text).not.toContain('Flights:');
  });
});
