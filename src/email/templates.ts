// Transactional email templates. Each returns plain text and HTML; every
// value that came from users or the catalogue is escaped in the HTML.

export interface RenderedEmail {
  template: string;
  subject: string;
  text: string;
  html: string;
}

export interface TripSummary {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
}

export interface StayLine {
  hotelName: string;
  checkInDate: string;
  checkOutDate: string;
  rooms: number;
  totalPrice: string;
  currency: string;
}

export interface FlightLine {
  flightNumber: string;
  airline: string;
  departureAt: string;
  passengers: number;
  totalPrice: string;
  currency: string;
}

/** A trip summary from an itinerary row and its destination. */
export const tripSummary = (trip: {
  name: string;
  startDate: Date;
  endDate: Date;
  destination: { name: string };
}): TripSummary => ({
  name: trip.name,
  destination: trip.destination.name,
  startDate: trip.startDate.toISOString().slice(0, 10),
  endDate: trip.endDate.toISOString().slice(0, 10),
});

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const e = escapeHtml;

const layout = (title: string, body: string) =>
  `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2933;max-width:560px;margin:0 auto;padding:24px">` +
  `<h1 style="font-size:20px">${e(title)}</h1>${body}` +
  `<p style="color:#7b8794;font-size:12px;margin-top:32px">Trek — travel planning and bookings</p>` +
  `</body></html>`;

const p = (text: string) => `<p>${e(text)}</p>`;

const tripLine = (trip: TripSummary) =>
  `${trip.name} — ${trip.destination}, ${trip.startDate} to ${trip.endDate}`;

const money = (amount: string, currency: string) => `${amount} ${currency}`;

// "2030-01-02T08:00:00.000Z" -> "2030-01-02 08:00 UTC"
const when = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

const stayText = (s: StayLine) =>
  `${s.hotelName}: ${s.checkInDate} to ${s.checkOutDate}, ${s.rooms} room(s), ${money(s.totalPrice, s.currency)}`;

const flightText = (f: FlightLine) =>
  `${f.airline} ${f.flightNumber}, departs ${when(f.departureAt)}, ${f.passengers} passenger(s), ${money(f.totalPrice, f.currency)}`;

const list = (items: string[]) =>
  `<ul>${items.map((item) => `<li>${e(item)}</li>`).join('')}</ul>`;

/**
 * A single-use code from an email, with a link to the app when APP_URL is
 * configured. Without a link, the code is entered in the app (or sent to the
 * API by a client).
 */
export interface ActionCode {
  code: string;
  link?: string;
}

const actionText = (action: ActionCode, verb: string, valid: string) =>
  action.link
    ? [`${verb}: ${action.link}`, '', `The link is valid for ${valid}.`]
    : [`Your code: ${action.code}`, '', `It is valid for ${valid}.`];

const actionHtml = (action: ActionCode, verb: string, valid: string) =>
  action.link
    ? `<p><a href="${e(action.link)}">${e(verb)}</a></p>` +
      p(`The link is valid for ${valid}.`)
    : `<p>Your code: <code style="font-size:14px">${e(action.code)}</code></p>` +
      p(`It is valid for ${valid}.`);

export const welcomeEmail = (
  firstName: string,
  verification: ActionCode,
): RenderedEmail => {
  const title = `Welcome to Trek, ${firstName}`;
  const intro =
    'Your account is ready. Browse destinations, put together a trip, and confirm it to book every hotel and flight at once.';
  const verb = 'Verify your email address';
  return {
    template: 'WELCOME',
    subject: title,
    text: [
      `Hi ${firstName},`,
      '',
      intro,
      '',
      ...actionText(verification, verb, '48 hours'),
    ].join('\n'),
    html: layout(title, p(intro) + actionHtml(verification, verb, '48 hours')),
  };
};

export const verifyEmailEmail = (
  firstName: string,
  verification: ActionCode,
): RenderedEmail => {
  const verb = 'Verify your email address';
  return {
    template: 'VERIFY_EMAIL',
    subject: 'Verify your email address',
    text: [
      `Hi ${firstName},`,
      '',
      ...actionText(verification, verb, '48 hours'),
    ].join('\n'),
    html: layout(
      verb,
      p(`Hi ${firstName},`) + actionHtml(verification, verb, '48 hours'),
    ),
  };
};

const NOT_YOU =
  "If this wasn't you, reset your password right away and contact support.";

export const passwordResetEmail = (
  firstName: string,
  reset: ActionCode,
): RenderedEmail => {
  const verb = 'Choose a new password';
  const ignore =
    "If you didn't ask for this, ignore this email: your password stays the same.";
  return {
    template: 'PASSWORD_RESET',
    subject: 'Reset your Trek password',
    text: [
      `Hi ${firstName},`,
      '',
      'Someone asked to reset the password for your account.',
      '',
      ...actionText(reset, verb, '1 hour'),
      '',
      ignore,
    ].join('\n'),
    html: layout(
      'Reset your password',
      p(`Hi ${firstName},`) +
        p('Someone asked to reset the password for your account.') +
        actionHtml(reset, verb, '1 hour') +
        p(ignore),
    ),
  };
};

export const passwordChangedEmail = (firstName: string): RenderedEmail => {
  const lines = [
    'Your Trek password was just changed, and every device was signed out.',
    NOT_YOU,
  ];
  return {
    template: 'PASSWORD_CHANGED',
    subject: 'Your Trek password was changed',
    text: [`Hi ${firstName},`, '', ...lines].join('\n'),
    html: layout(
      'Your password was changed',
      [`Hi ${firstName},`, ...lines].map(p).join(''),
    ),
  };
};

// Sent to the old address, so an account takeover can't silently move it.
export const emailChangedEmail = (
  firstName: string,
  newEmail: string,
): RenderedEmail => {
  const lines = [
    `The email address on your Trek account was changed to ${newEmail}. Messages now go there.`,
    NOT_YOU,
  ];
  return {
    template: 'EMAIL_CHANGED',
    subject: 'Your Trek email address was changed',
    text: [`Hi ${firstName},`, '', ...lines].join('\n'),
    html: layout(
      'Your email address was changed',
      [`Hi ${firstName},`, ...lines].map(p).join(''),
    ),
  };
};

export const itineraryConfirmedEmail = (
  firstName: string,
  trip: TripSummary,
  stays: StayLine[],
  flights: FlightLine[],
  totals: Record<string, string>,
): RenderedEmail => {
  const totalText = Object.entries(totals)
    .map(([currency, amount]) => money(amount, currency))
    .join(' + ');
  const text = [
    `Hi ${firstName},`,
    '',
    `Your trip is booked: ${tripLine(trip)}.`,
    ...(stays.length
      ? ['', 'Hotels:', ...stays.map((s) => `- ${stayText(s)}`)]
      : []),
    ...(flights.length
      ? ['', 'Flights:', ...flights.map((f) => `- ${flightText(f)}`)]
      : []),
    '',
    `Total: ${totalText}`,
  ].join('\n');
  const html = layout(
    'Your trip is booked',
    p(`Hi ${firstName},`) +
      p(tripLine(trip)) +
      (stays.length
        ? `<h2 style="font-size:16px">Hotels</h2>${list(stays.map(stayText))}`
        : '') +
      (flights.length
        ? `<h2 style="font-size:16px">Flights</h2>${list(flights.map(flightText))}`
        : '') +
      `<p><strong>Total: ${e(totalText)}</strong></p>`,
  );
  return {
    template: 'ITINERARY_CONFIRMED',
    subject: `Booked: ${trip.name}`,
    text,
    html,
  };
};

export const itineraryCancelledEmail = (
  firstName: string,
  trip: TripSummary,
): RenderedEmail => {
  const lines = [
    `Your trip ${tripLine(trip)} has been cancelled.`,
    'All of its hotel rooms and flight seats have been released.',
  ];
  return {
    template: 'ITINERARY_CANCELLED',
    subject: `Cancelled: ${trip.name}`,
    text: [`Hi ${firstName},`, '', ...lines].join('\n'),
    html: layout(
      'Your trip was cancelled',
      [`Hi ${firstName},`, ...lines].map(p).join(''),
    ),
  };
};

export const itineraryCompletedEmail = (
  firstName: string,
  trip: TripSummary,
): RenderedEmail => {
  const lines = [
    `We hope you enjoyed ${trip.name} in ${trip.destination}.`,
    'Your trip is now marked as completed. Where to next?',
  ];
  return {
    template: 'ITINERARY_COMPLETED',
    subject: `Welcome back from ${trip.name}`,
    text: [`Hi ${firstName},`, '', ...lines].join('\n'),
    html: layout(
      'Welcome back',
      [`Hi ${firstName},`, ...lines].map(p).join(''),
    ),
  };
};
