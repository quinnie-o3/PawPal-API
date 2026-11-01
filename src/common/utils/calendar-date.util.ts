import {
  buildMessage,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Returns true for a real calendar date in strict `YYYY-MM-DD` form.
 *
 * Validates month and day ranges arithmetically (Gregorian leap years)
 * instead of relying on `Date` parsing, which silently rolls invalid dates
 * forward (e.g. `2027-02-30` becomes March 2). Year 0000 is rejected because
 * PostgreSQL DATE has no year zero.
 */
export function isCalendarDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const match = CALENDAR_DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

/**
 * Today's calendar date as `YYYY-MM-DD` in the server's local time zone.
 *
 * This matches the existing convention for "today" in availability and
 * booking date checks; the server is expected to run in the business time
 * zone (Asia/Ho_Chi_Minh).
 */
export function getTodayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Validates a strict `YYYY-MM-DD` calendar date (no time or offset). */
export function IsCalendarDate(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isCalendarDate',
      validator: {
        validate: (value: unknown) => isCalendarDateString(value),
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must be a valid calendar date in YYYY-MM-DD format`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}

/**
 * Rejects calendar dates after today (server local date). Today is allowed.
 * Non-dates are left to `IsCalendarDate` so only one message is reported.
 */
export function IsNotFutureCalendarDate(
  validationOptions?: ValidationOptions,
) {
  return ValidateBy(
    {
      name: 'isNotFutureCalendarDate',
      validator: {
        // Canonical YYYY-MM-DD strings compare chronologically.
        validate: (value: unknown) =>
          !isCalendarDateString(value) || value <= getTodayDateString(),
        defaultMessage: buildMessage(
          (eachPrefix) => `${eachPrefix}$property cannot be in the future`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
