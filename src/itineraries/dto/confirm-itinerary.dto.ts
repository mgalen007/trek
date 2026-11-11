import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const CURRENCY = /^[A-Z]{3}$/;
const AMOUNT = /^\d+(\.\d{1,2})?$/;

@ValidatorConstraint({ name: 'currencyAmounts' })
class CurrencyAmounts implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.entries(value).every(
        ([currency, amount]) =>
          CURRENCY.test(currency) &&
          typeof amount === 'string' &&
          AMOUNT.test(amount),
      )
    );
  }

  defaultMessage() {
    return 'expectedTotals must map 3-letter currency codes to amounts like "1100.00"';
  }
}

/**
 * What the user reviewed, from GET /itineraries/:id/quote. Confirm fails
 * instead of booking anything different.
 */
export class ConfirmItineraryDto {
  /** The quote's `version`: confirm fails with ITINERARY_CHANGED otherwise. */
  @IsInt()
  @Min(1)
  expectedVersion: number;

  /**
   * The quote's `totals`, e.g. `{ "USD": "1100.00" }`: confirm fails with
   * PRICE_CHANGED if current prices add up to anything else.
   */
  @IsObject()
  @Validate(CurrencyAmounts)
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', example: '1100.00' },
    example: { USD: '1100.00' },
  })
  expectedTotals: Record<string, string>;
}
