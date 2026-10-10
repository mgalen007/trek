/** A person the user books travel for. Visible only to its owner. */
export class TravelerEntity {
  id: string;
  /** The account that manages this traveler. */
  userId: string;
  firstName: string;
  lastName: string;
  /** UTC midnight of the date of birth. */
  dateOfBirth: Date;
  /** ISO 3166-1 alpha-2 country code. */
  nationality: string;
  createdAt: Date;
  updatedAt: Date;
}
