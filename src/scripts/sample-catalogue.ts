// Sample catalogue for development and demos. Hotel and airline names are
// invented; airport codes are real. Flight times are in UTC.

export interface SampleHotel {
  name: string;
  address: string;
  rating: number;
  nightlyRate: number;
  currency: string;
  totalRooms: number;
}

export interface SampleDestination {
  name: string;
  city: string;
  country: string;
  description: string;
  latitude: number;
  longitude: number;
  airport: { code: string; name: string };
  hotels: SampleHotel[];
}

const hotel = (
  name: string,
  address: string,
  rating: number,
  nightlyRate: number,
  currency: string,
  totalRooms: number,
): SampleHotel => ({
  name,
  address,
  rating,
  nightlyRate,
  currency,
  totalRooms,
});

export const DESTINATIONS: SampleDestination[] = [
  // East Africa
  {
    name: 'Kigali',
    city: 'Kigali',
    country: 'Rwanda',
    description:
      'Clean, green hilltop capital: genocide memorial, art galleries and the gateway to gorilla trekking.',
    latitude: -1.9441,
    longitude: 30.0619,
    airport: { code: 'KGL', name: 'Kigali International Airport' },
    hotels: [
      hotel('Hillside Haven Kigali', 'KG 7 Ave, Kacyiru', 4.5, 140, 'USD', 40),
      hotel(
        'Kimihurura Garden Lodge',
        'KG 549 St, Kimihurura',
        4,
        95000,
        'RWF',
        25,
      ),
      hotel(
        'Nyamirambo Backpackers',
        'KN 2 St, Nyamirambo',
        3.5,
        30000,
        'RWF',
        30,
      ),
    ],
  },
  {
    name: 'Nairobi',
    city: 'Nairobi',
    country: 'Kenya',
    description:
      'East Africa’s hub, with a national park inside the city limits and safaris a short hop away.',
    latitude: -1.2921,
    longitude: 36.8219,
    airport: { code: 'NBO', name: 'Jomo Kenyatta International Airport' },
    hotels: [
      hotel('Karura Forest Hotel', 'Limuru Rd, Gigiri', 4.5, 180, 'USD', 80),
      hotel(
        'Westlands City Suites',
        'Woodvale Grove, Westlands',
        4,
        12500,
        'KES',
        60,
      ),
      hotel(
        'Kilimani Budget Inn',
        'Argwings Kodhek Rd, Kilimani',
        3,
        5500,
        'KES',
        40,
      ),
    ],
  },
  {
    name: 'Zanzibar',
    city: 'Stone Town',
    country: 'Tanzania',
    description:
      'Spice island of white-sand beaches, coral reefs and the winding lanes of historic Stone Town.',
    latitude: -6.1659,
    longitude: 39.2026,
    airport: { code: 'ZNZ', name: 'Abeid Amani Karume International Airport' },
    hotels: [
      hotel(
        'Spice Coast Beach Resort',
        'Nungwi Beach Rd, Nungwi',
        4.5,
        220,
        'USD',
        50,
      ),
      hotel(
        'Stone Town Courtyard Hotel',
        'Kenyatta Rd, Stone Town',
        4,
        95,
        'USD',
        30,
      ),
      hotel('Paje Kite Bungalows', 'Paje Beach, Paje', 3.5, 60, 'USD', 20),
    ],
  },
  {
    name: 'Kampala',
    city: 'Kampala',
    country: 'Uganda',
    description:
      'Lively capital on seven hills near Lake Victoria and the source of the Nile.',
    latitude: 0.3476,
    longitude: 32.5825,
    airport: { code: 'EBB', name: 'Entebbe International Airport' },
    hotels: [
      hotel(
        'Lake Victoria View Hotel',
        'Lugogo Bypass, Nakawa',
        4.5,
        150,
        'USD',
        60,
      ),
      hotel(
        'Kololo Hills Residence',
        'Upper Kololo Terrace, Kololo',
        4,
        280000,
        'UGX',
        35,
      ),
      hotel(
        'Kampala Central Guesthouse',
        'Bombo Rd, Central',
        3,
        110000,
        'UGX',
        25,
      ),
    ],
  },
  // Southern Africa and the Middle East
  {
    name: 'Cape Town',
    city: 'Cape Town',
    country: 'South Africa',
    description:
      'Table Mountain, two oceans, winelands next door and some of the world’s best coastal drives.',
    latitude: -33.9249,
    longitude: 18.4241,
    airport: { code: 'CPT', name: 'Cape Town International Airport' },
    hotels: [
      hotel(
        'Table Mountain Grand',
        'Kloof Nek Rd, Tamboerskloof',
        5,
        4200,
        'ZAR',
        90,
      ),
      hotel('Bo-Kaap Boutique Hotel', 'Wale St, Bo-Kaap', 4, 2100, 'ZAR', 30),
      hotel('Sea Point Surf Lodge', 'Main Rd, Sea Point', 3.5, 950, 'ZAR', 40),
    ],
  },
  {
    name: 'Dubai',
    city: 'Dubai',
    country: 'United Arab Emirates',
    description:
      'Desert city of record-breaking towers, old souks along the creek and a global flight hub.',
    latitude: 25.2048,
    longitude: 55.2708,
    airport: { code: 'DXB', name: 'Dubai International Airport' },
    hotels: [
      hotel('Creekside Palace Dubai', 'Baniyas Rd, Deira', 5, 1100, 'AED', 200),
      hotel(
        'Marina Skyline Hotel',
        'Marina Walk, Dubai Marina',
        4.5,
        650,
        'AED',
        150,
      ),
      hotel('Deira Souk Inn', 'Al Ras St, Deira', 3.5, 280, 'AED', 80),
    ],
  },
  // Europe
  {
    name: 'London',
    city: 'London',
    country: 'United Kingdom',
    description:
      'Museums that cost nothing, royal parks, West End theatre and markets in every borough.',
    latitude: 51.5072,
    longitude: -0.1276,
    airport: { code: 'LHR', name: 'London Heathrow Airport' },
    hotels: [
      hotel(
        'Kensington Crescent Hotel',
        'Queen’s Gate, Kensington',
        4.5,
        290,
        'GBP',
        120,
      ),
      hotel(
        'Southbank Riverside Rooms',
        'Belvedere Rd, South Bank',
        4,
        180,
        'GBP',
        90,
      ),
      hotel('Camden Lock Hostel', 'Chalk Farm Rd, Camden', 3, 70, 'GBP', 60),
    ],
  },
  {
    name: 'Paris',
    city: 'Paris',
    country: 'France',
    description:
      'Boulevards, bistros and the Louvre; the classic city break, best explored on foot.',
    latitude: 48.8566,
    longitude: 2.3522,
    airport: { code: 'CDG', name: 'Paris Charles de Gaulle Airport' },
    hotels: [
      hotel(
        'Hôtel des Tuileries Royales',
        'Rue de Rivoli, 1er',
        5,
        340,
        'EUR',
        80,
      ),
      hotel(
        'Le Marais Atelier',
        'Rue Vieille du Temple, 4e',
        4,
        190,
        'EUR',
        45,
      ),
      hotel('Montmartre Petit Hôtel', 'Rue Lepic, 18e', 3.5, 110, 'EUR', 35),
    ],
  },
  {
    name: 'Amsterdam',
    city: 'Amsterdam',
    country: 'Netherlands',
    description:
      'Canal rings, world-class museums and a city made for bicycles.',
    latitude: 52.3676,
    longitude: 4.9041,
    airport: { code: 'AMS', name: 'Amsterdam Airport Schiphol' },
    hotels: [
      hotel(
        'Canal Ring Residence',
        'Herengracht, Centrum',
        4.5,
        260,
        'EUR',
        70,
      ),
      hotel(
        'Jordaan Houseboat Hotel',
        'Prinsengracht, Jordaan',
        4,
        170,
        'EUR',
        20,
      ),
      hotel(
        'De Pijp City Stay',
        'Ferdinand Bolstraat, De Pijp',
        3.5,
        95,
        'EUR',
        50,
      ),
    ],
  },
  {
    name: 'Lisbon',
    city: 'Lisbon',
    country: 'Portugal',
    description:
      'Sunny hills, tiled façades, trams and pastel de nata, with beaches a train ride away.',
    latitude: 38.7223,
    longitude: -9.1393,
    airport: { code: 'LIS', name: 'Humberto Delgado Airport' },
    hotels: [
      hotel(
        'Alfama Terrace Hotel',
        'Rua de São Miguel, Alfama',
        4.5,
        180,
        'EUR',
        55,
      ),
      hotel('Chiado Tile House', 'Rua Garrett, Chiado', 4, 120, 'EUR', 30),
      hotel(
        'Bairro Alto Hostel',
        'Rua da Rosa, Bairro Alto',
        3.5,
        45,
        'EUR',
        50,
      ),
    ],
  },
  {
    name: 'Barcelona',
    city: 'Barcelona',
    country: 'Spain',
    description:
      'Gaudí’s architecture, Mediterranean beaches and late-night tapas.',
    latitude: 41.3874,
    longitude: 2.1686,
    airport: {
      code: 'BCN',
      name: 'Josep Tarradellas Barcelona-El Prat Airport',
    },
    hotels: [
      hotel(
        'Eixample Modernista Hotel',
        'Passeig de Gràcia, Eixample',
        4.5,
        210,
        'EUR',
        90,
      ),
      hotel(
        'Barceloneta Beach Rooms',
        'Passeig Joan de Borbó, Barceloneta',
        4,
        140,
        'EUR',
        40,
      ),
      hotel(
        'Gràcia Garden Hostel',
        'Carrer de Verdi, Gràcia',
        3.5,
        55,
        'EUR',
        45,
      ),
    ],
  },
  {
    name: 'Rome',
    city: 'Rome',
    country: 'Italy',
    description:
      'Three thousand years of history around every corner, and the best espresso you’ll find.',
    latitude: 41.9028,
    longitude: 12.4964,
    airport: { code: 'FCO', name: 'Leonardo da Vinci-Fiumicino Airport' },
    hotels: [
      hotel(
        'Palazzo Aventino',
        'Via di Santa Sabina, Aventino',
        5,
        280,
        'EUR',
        60,
      ),
      hotel(
        'Trastevere Corner Hotel',
        'Via della Lungaretta, Trastevere',
        4,
        150,
        'EUR',
        35,
      ),
      hotel(
        'Termini Travellers Inn',
        'Via Marsala, Esquilino',
        3,
        75,
        'EUR',
        50,
      ),
    ],
  },
  // The Americas
  {
    name: 'New York',
    city: 'New York',
    country: 'United States',
    description:
      'Skyline, Broadway, Central Park and food from every corner of the world.',
    latitude: 40.7128,
    longitude: -74.006,
    airport: { code: 'JFK', name: 'John F. Kennedy International Airport' },
    hotels: [
      hotel(
        'Central Park Gilded Hotel',
        'Central Park South, Manhattan',
        5,
        450,
        'USD',
        200,
      ),
      hotel(
        'Brooklyn Bridge Lofts',
        'Water St, DUMBO, Brooklyn',
        4,
        260,
        'USD',
        80,
      ),
      hotel('Midtown Pod Rooms', 'W 39th St, Manhattan', 3.5, 140, 'USD', 150),
    ],
  },
  {
    name: 'Los Angeles',
    city: 'Los Angeles',
    country: 'United States',
    description: 'Beaches, hiking trails, studio tours and endless sunshine.',
    latitude: 34.0522,
    longitude: -118.2437,
    airport: { code: 'LAX', name: 'Los Angeles International Airport' },
    hotels: [
      hotel(
        'Santa Monica Pier Hotel',
        'Ocean Ave, Santa Monica',
        4.5,
        320,
        'USD',
        120,
      ),
      hotel(
        'Silver Lake Bungalows',
        'Sunset Blvd, Silver Lake',
        4,
        190,
        'USD',
        30,
      ),
      hotel(
        'Downtown Arts District Inn',
        'E 3rd St, Arts District',
        3.5,
        120,
        'USD',
        70,
      ),
    ],
  },
  {
    name: 'Toronto',
    city: 'Toronto',
    country: 'Canada',
    description:
      'Lakeside city of neighbourhoods, with Niagara Falls a short drive away.',
    latitude: 43.6532,
    longitude: -79.3832,
    airport: { code: 'YYZ', name: 'Toronto Pearson International Airport' },
    hotels: [
      hotel(
        'Harbourfront Grand Toronto',
        'Queens Quay W, Harbourfront',
        4.5,
        360,
        'CAD',
        150,
      ),
      hotel(
        'Distillery District Suites',
        'Mill St, Distillery District',
        4,
        230,
        'CAD',
        45,
      ),
      hotel(
        'Kensington Market Hostel',
        'Augusta Ave, Kensington Market',
        3,
        75,
        'CAD',
        40,
      ),
    ],
  },
  {
    name: 'Mexico City',
    city: 'Mexico City',
    country: 'Mexico',
    description:
      'Aztec ruins, grand museums, leafy neighbourhoods and a legendary street-food scene.',
    latitude: 19.4326,
    longitude: -99.1332,
    airport: { code: 'MEX', name: 'Mexico City International Airport' },
    hotels: [
      hotel(
        'Reforma Plaza Hotel',
        'Paseo de la Reforma, Juárez',
        4.5,
        4200,
        'MXN',
        110,
      ),
      hotel('Roma Norte Casa', 'Calle Colima, Roma Norte', 4, 2300, 'MXN', 25),
      hotel(
        'Centro Histórico Hostal',
        'Calle República de Cuba, Centro',
        3.5,
        750,
        'MXN',
        40,
      ),
    ],
  },
  {
    name: 'Rio de Janeiro',
    city: 'Rio de Janeiro',
    country: 'Brazil',
    description:
      'Famous beaches, Sugarloaf and Christ the Redeemer, samba and mountains meeting the sea.',
    latitude: -22.9068,
    longitude: -43.1729,
    airport: {
      code: 'GIG',
      name: 'Rio de Janeiro/Galeão International Airport',
    },
    hotels: [
      hotel(
        'Copacabana Oceanfront',
        'Av. Atlântica, Copacabana',
        4.5,
        1200,
        'BRL',
        140,
      ),
      hotel(
        'Santa Teresa Hillside Pousada',
        'Rua Almirante Alexandrino, Santa Teresa',
        4,
        520,
        'BRL',
        20,
      ),
      hotel(
        'Ipanema Beach Hostel',
        'Rua Barão da Torre, Ipanema',
        3.5,
        180,
        'BRL',
        50,
      ),
    ],
  },
];

// Invented airlines, one per region.
export const AIRLINES = {
  SV: { name: 'Savanna Air', currency: 'USD' },
  GH: { name: 'Gulf Horizon', currency: 'USD' },
  EL: { name: 'EuroLink', currency: 'EUR' },
  AX: { name: 'Atlantic Crossing Airways', currency: 'USD' },
  AL: { name: 'AmeriLink', currency: 'USD' },
} as const;

export type AirlineCode = keyof typeof AIRLINES;

export interface SampleRoute {
  airline: AirlineCode;
  from: string;
  to: string;
  /** Flight time in minutes. */
  minutes: number;
  /** Base one-way fare per passenger, in the airline's currency. */
  fare: number;
  /** Outbound departure times (UTC, "HH:MM"); the return leaves later. */
  times: string[];
  /** Days of the week flown (0 = Sunday); every day when omitted. */
  days?: number[];
}

const MON_WED_FRI = [1, 3, 5];
const TUE_THU_SAT = [2, 4, 6];

// Every route is flown both ways.
export const ROUTES: SampleRoute[] = [
  // Within East Africa
  {
    airline: 'SV',
    from: 'KGL',
    to: 'NBO',
    minutes: 90,
    fare: 180,
    times: ['06:30', '17:15'],
  },
  {
    airline: 'SV',
    from: 'KGL',
    to: 'EBB',
    minutes: 60,
    fare: 150,
    times: ['08:00'],
  },
  {
    airline: 'SV',
    from: 'NBO',
    to: 'EBB',
    minutes: 70,
    fare: 160,
    times: ['09:30', '18:00'],
  },
  {
    airline: 'SV',
    from: 'NBO',
    to: 'ZNZ',
    minutes: 90,
    fare: 190,
    times: ['07:45'],
  },
  {
    airline: 'SV',
    from: 'KGL',
    to: 'ZNZ',
    minutes: 150,
    fare: 240,
    times: ['10:00'],
    days: MON_WED_FRI,
  },
  {
    airline: 'SV',
    from: 'NBO',
    to: 'CPT',
    minutes: 240,
    fare: 420,
    times: ['11:00'],
  },
  // Through Dubai
  {
    airline: 'GH',
    from: 'NBO',
    to: 'DXB',
    minutes: 300,
    fare: 480,
    times: ['22:30'],
  },
  {
    airline: 'GH',
    from: 'KGL',
    to: 'DXB',
    minutes: 330,
    fare: 520,
    times: ['21:00'],
    days: [0, 2, 4, 6],
  },
  {
    airline: 'GH',
    from: 'CPT',
    to: 'DXB',
    minutes: 570,
    fare: 700,
    times: ['18:30'],
    days: [0, 1, 3, 5],
  },
  {
    airline: 'GH',
    from: 'DXB',
    to: 'LHR',
    minutes: 450,
    fare: 640,
    times: ['02:30', '14:00'],
  },
  {
    airline: 'GH',
    from: 'DXB',
    to: 'CDG',
    minutes: 420,
    fare: 610,
    times: ['03:00'],
  },
  {
    airline: 'GH',
    from: 'DXB',
    to: 'JFK',
    minutes: 840,
    fare: 950,
    times: ['08:30'],
  },
  // Africa to Europe
  {
    airline: 'EL',
    from: 'NBO',
    to: 'AMS',
    minutes: 510,
    fare: 690,
    times: ['23:00'],
  },
  {
    airline: 'EL',
    from: 'KGL',
    to: 'AMS',
    minutes: 510,
    fare: 720,
    times: ['22:00'],
    days: [1, 4, 6],
  },
  {
    airline: 'EL',
    from: 'CPT',
    to: 'LHR',
    minutes: 690,
    fare: 850,
    times: ['19:00'],
  },
  // Within Europe
  {
    airline: 'EL',
    from: 'LHR',
    to: 'CDG',
    minutes: 75,
    fare: 120,
    times: ['07:00', '12:30', '18:45'],
  },
  {
    airline: 'EL',
    from: 'LHR',
    to: 'AMS',
    minutes: 75,
    fare: 115,
    times: ['08:15', '17:30'],
  },
  {
    airline: 'EL',
    from: 'CDG',
    to: 'FCO',
    minutes: 120,
    fare: 140,
    times: ['09:00'],
  },
  {
    airline: 'EL',
    from: 'CDG',
    to: 'LIS',
    minutes: 150,
    fare: 150,
    times: ['10:30'],
  },
  {
    airline: 'EL',
    from: 'AMS',
    to: 'BCN',
    minutes: 135,
    fare: 135,
    times: ['11:15'],
  },
  {
    airline: 'EL',
    from: 'LIS',
    to: 'BCN',
    minutes: 105,
    fare: 110,
    times: ['13:00'],
  },
  {
    airline: 'EL',
    from: 'FCO',
    to: 'BCN',
    minutes: 105,
    fare: 115,
    times: ['15:30'],
    days: TUE_THU_SAT,
  },
  // Across the Atlantic
  {
    airline: 'AX',
    from: 'LHR',
    to: 'JFK',
    minutes: 480,
    fare: 780,
    times: ['10:00', '16:30'],
  },
  {
    airline: 'AX',
    from: 'CDG',
    to: 'JFK',
    minutes: 510,
    fare: 760,
    times: ['11:30'],
  },
  {
    airline: 'AX',
    from: 'AMS',
    to: 'YYZ',
    minutes: 510,
    fare: 740,
    times: ['12:15'],
  },
  {
    airline: 'AX',
    from: 'LIS',
    to: 'GIG',
    minutes: 600,
    fare: 820,
    times: ['21:30'],
    days: [0, 2, 5],
  },
  // Within the Americas
  {
    airline: 'AL',
    from: 'JFK',
    to: 'LAX',
    minutes: 360,
    fare: 310,
    times: ['07:00', '15:00'],
  },
  {
    airline: 'AL',
    from: 'JFK',
    to: 'YYZ',
    minutes: 105,
    fare: 210,
    times: ['09:15', '19:30'],
  },
  {
    airline: 'AL',
    from: 'JFK',
    to: 'MEX',
    minutes: 300,
    fare: 380,
    times: ['08:45'],
  },
  {
    airline: 'AL',
    from: 'LAX',
    to: 'MEX',
    minutes: 210,
    fare: 290,
    times: ['12:00'],
  },
  {
    airline: 'AL',
    from: 'YYZ',
    to: 'LAX',
    minutes: 300,
    fare: 340,
    times: ['10:45'],
  },
  {
    airline: 'AL',
    from: 'JFK',
    to: 'GIG',
    minutes: 600,
    fare: 880,
    times: ['21:00'],
  },
  {
    airline: 'AL',
    from: 'MEX',
    to: 'GIG',
    minutes: 570,
    fare: 760,
    times: ['23:30'],
    days: [1, 4, 6],
  },
];
