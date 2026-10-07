export class DestinationEntity {
  id: string;
  name: string;
  city: string;
  country: string;
  description: string | null;
  /** Decimal degrees, serialized as a string. */
  latitude: string | null;
  /** Decimal degrees, serialized as a string. */
  longitude: string | null;
  createdAt: Date;
  updatedAt: Date;
}
