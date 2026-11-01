import {
  BadRequestException,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import type { Repository } from 'typeorm';

import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ParseBigIntIdPipe } from '../common/pipes/parse-bigint-id.pipe';
import { getTodayDateString } from '../common/utils/calendar-date.util';
import { Provider } from '../providers/entities/provider.entity';
import { Service } from '../services/entities/service.entity';
import { AvailabilityController } from './availability.controller';
import { AvailabilityModule } from './availability.module';
import { AvailabilityService } from './availability.service';
import { AvailabilitySlot } from './entities/availability-slot.entity';
import { PublicAvailabilityController } from './public-availability.controller';

type Row = Record<string, unknown>;

/**
 * In-memory stand-in for the SelectQueryBuilder calls used by the public
 * slot queries. It evaluates the real conditions issued by the service
 * (`a.b = :p`, `a.b >= :p`, `a.b < a.c`) against nested rows.
 */
function createFakeQueryBuilder(rows: Row[]) {
  const conditions: Array<(row: Row) => boolean> = [];
  const orderings: Array<[string, 'ASC' | 'DESC']> = [];

  const resolve = (row: Row, path: string): unknown => {
    const [alias, field] = path.split('.');
    const service = row.service as Row;
    const source: Row =
      alias === 'slot'
        ? row
        : alias === 'category'
          ? (service.category as Row)
          : (row[alias] as Row);

    return source[field];
  };

  const addCondition = (expression: string, params: Row = {}) => {
    let match = /^(\w+\.\w+) = :(\w+)$/.exec(expression);

    if (match) {
      const [, path, param] = match;
      conditions.push((row) => resolve(row, path) === params[param]);
      return;
    }

    match = /^(\w+\.\w+) >= :(\w+)$/.exec(expression);

    if (match) {
      const [, path, param] = match;
      conditions.push(
        (row) => String(resolve(row, path)) >= String(params[param]),
      );
      return;
    }

    match = /^(\w+\.\w+) < (\w+\.\w+)$/.exec(expression);

    if (match) {
      const [, left, right] = match;
      conditions.push(
        (row) => (resolve(row, left) as number) < (resolve(row, right) as number),
      );
      return;
    }

    throw new Error(`Unsupported condition in fake: ${expression}`);
  };

  const getMany = (): Promise<Row[]> => {
    const matched = rows.filter((row) =>
      conditions.every((condition) => condition(row)),
    );

    matched.sort((a, b) => {
      for (const [path, direction] of orderings) {
        const left = resolve(a, path);
        const right = resolve(b, path);
        const result =
          path === 'slot.id'
            ? Number(BigInt(left as string) - BigInt(right as string))
            : String(left).localeCompare(String(right));

        if (result !== 0) {
          return direction === 'ASC' ? result : -result;
        }
      }

      return 0;
    });

    return Promise.resolve(matched);
  };

  const builder: Record<string, jest.Mock> = {};

  Object.assign(builder, {
    innerJoinAndSelect: jest.fn(() => builder),
    where: jest.fn((expression: string, params?: Row) => {
      addCondition(expression, params);
      return builder;
    }),
    andWhere: jest.fn((expression: string, params?: Row) => {
      addCondition(expression, params);
      return builder;
    }),
    orderBy: jest.fn((path: string, direction: 'ASC' | 'DESC') => {
      orderings.push([path, direction]);
      return builder;
    }),
    addOrderBy: jest.fn((path: string, direction: 'ASC' | 'DESC') => {
      orderings.push([path, direction]);
      return builder;
    }),
    getMany: jest.fn(getMany),
    getOne: jest.fn(() => getMany().then((matched) => matched[0] ?? null)),
  });

  return builder;
}

function createController(rows: Row[]) {
  const service = new AvailabilityService(
    {
      createQueryBuilder: jest.fn(() => createFakeQueryBuilder(rows)),
    } as unknown as Repository<AvailabilitySlot>,
    {} as Repository<Provider>,
    {} as Repository<Service>,
  );

  return new PublicAvailabilityController(service);
}

function shiftDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return getTodayDateString(date);
}

// Full entity graph as TypeORM hydrates it, including internal fields.
const slotRow = (
  id: string,
  overrides: {
    slotDate?: string;
    startTime?: string;
    status?: AvailabilitySlot['status'];
    capacity?: number;
    bookedCount?: number;
    approvalStatus?: Provider['approvalStatus'];
    serviceStatus?: 'ACTIVE' | 'INACTIVE';
    categoryStatus?: 'ACTIVE' | 'INACTIVE';
  } = {},
): Row => ({
  id,
  providerId: '1',
  serviceId: '5',
  slotDate: overrides.slotDate ?? shiftDays(7),
  startTime: overrides.startTime ?? '09:00:00',
  endTime: '10:00:00',
  capacity: overrides.capacity ?? 3,
  bookedCount: overrides.bookedCount ?? 1,
  status: overrides.status ?? 'OPEN',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-02T00:00:00.000Z'),
  provider: {
    id: '1',
    ownerId: '77',
    businessName: 'Paw Spa',
    address: '1 Nguyen Hue, District 1',
    phone: '0901234567',
    description: 'Grooming studio',
    approvalStatus: overrides.approvalStatus ?? 'APPROVED',
    ratingAvg: '4.50',
    ratingCount: 2,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-02T00:00:00.000Z'),
  },
  service: {
    id: '5',
    providerId: '1',
    categoryId: '2',
    name: 'Full grooming',
    description: 'Bath and trim',
    price: '150000.00',
    durationMinutes: 60,
    status: overrides.serviceStatus ?? 'ACTIVE',
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
    updatedAt: new Date('2026-09-06T00:00:00.000Z'),
    category: {
      id: '2',
      name: 'Grooming',
      description: 'Coat care',
      status: overrides.categoryStatus ?? 'ACTIVE',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    },
  },
});

describe('Public availability (C-06)', () => {
  describe('registration and routing', () => {
    it('is registered in AvailabilityModule next to the owner controller', () => {
      const controllers = Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        AvailabilityModule,
      ) as unknown[];

      expect(controllers).toContain(PublicAvailabilityController);
      expect(controllers).toContain(AvailabilityController);
    });

    it('mounts public GET list and detail routes without guards', () => {
      const { prototype } = PublicAvailabilityController;

      expect(
        Reflect.getMetadata(PATH_METADATA, PublicAvailabilityController),
      ).toBe('availability/public');
      expect(Reflect.getMetadata(PATH_METADATA, prototype.getPublicSlots)).toBe('/');
      expect(Reflect.getMetadata(PATH_METADATA, prototype.getPublicSlotById)).toBe(
        ':id',
      );
      expect(Reflect.getMetadata(METHOD_METADATA, prototype.getPublicSlots)).toBe(
        RequestMethod.GET,
      );
      expect(
        Reflect.getMetadata(METHOD_METADATA, prototype.getPublicSlotById),
      ).toBe(RequestMethod.GET);
      expect(
        Reflect.getMetadata(GUARDS_METADATA, PublicAvailabilityController),
      ).toBeUndefined();
    });
  });

  describe('visibility filtering', () => {
    const rows = [
      slotRow('1'),
      slotRow('2', { approvalStatus: 'PENDING' }),
      slotRow('3', { approvalStatus: 'REJECTED' }),
      slotRow('4', { approvalStatus: 'SUSPENDED' }),
      slotRow('5', { serviceStatus: 'INACTIVE' }),
      slotRow('6', { categoryStatus: 'INACTIVE' }),
      slotRow('7', { status: 'CLOSED' }),
      slotRow('8', { status: 'CANCELLED' }),
      slotRow('9', { capacity: 2, bookedCount: 2 }),
      slotRow('10', { slotDate: shiftDays(-1) }),
    ];

    it('lists only open, future, non-full slots of approved providers with active service and category', async () => {
      const result = await createController(rows).getPublicSlots();

      expect(result.map((slot) => slot.id)).toEqual(['1']);
    });

    it('includes a slot dated today', async () => {
      const result = await createController([
        slotRow('11', { slotDate: getTodayDateString() }),
      ]).getPublicSlots();

      expect(result.map((slot) => slot.id)).toEqual(['11']);
    });

    it('returns an empty list when nothing is bookable', async () => {
      await expect(
        createController([slotRow('9', { capacity: 1, bookedCount: 1 })]).getPublicSlots(),
      ).resolves.toEqual([]);
    });

    it('returns detail for a bookable slot', async () => {
      await expect(
        createController(rows).getPublicSlotById('1'),
      ).resolves.toMatchObject({ id: '1', capacity: 3, bookedCount: 1 });
    });

    it.each([
      ['2', 'PENDING provider'],
      ['3', 'REJECTED provider'],
      ['4', 'SUSPENDED provider'],
      ['5', 'INACTIVE service'],
      ['6', 'INACTIVE category'],
      ['7', 'CLOSED slot'],
      ['8', 'CANCELLED slot'],
      ['9', 'full slot'],
      ['10', 'past slot'],
      ['999', 'nonexistent slot'],
    ])('returns 404 for slot %s (%s)', async (id) => {
      await expect(
        createController(rows).getPublicSlotById(id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('orders by date, start time, then id', async () => {
      const day = shiftDays(5);
      const result = await createController([
        slotRow('30', { slotDate: shiftDays(6) }),
        slotRow('21', { slotDate: day, startTime: '10:00:00' }),
        slotRow('20', { slotDate: day, startTime: '09:00:00' }),
        slotRow('12', { slotDate: day, startTime: '09:00:00' }),
      ]).getPublicSlots();

      expect(result.map((slot) => slot.id)).toEqual(['12', '20', '21', '30']);
    });
  });

  describe('public projection', () => {
    const expected = (id: string) => ({
      id,
      slotDate: expect.any(String),
      startTime: '09:00:00',
      endTime: '10:00:00',
      capacity: 3,
      bookedCount: 1,
      service: {
        id: '5',
        name: 'Full grooming',
        description: 'Bath and trim',
        price: '150000.00',
        durationMinutes: 60,
        category: { id: '2', name: 'Grooming', description: 'Coat care' },
      },
      provider: {
        id: '1',
        businessName: 'Paw Spa',
        address: '1 Nguyen Hue, District 1',
        description: 'Grooming studio',
        ratingAvg: '4.50',
        ratingCount: 2,
      },
    });

    it('returns the same documented shape for list and detail', async () => {
      const controller = createController([slotRow('1')]);
      const [listItem] = await controller.getPublicSlots();
      const detail = await controller.getPublicSlotById('1');

      expect(listItem).toEqual(expected('1'));
      expect(detail).toEqual(expected('1'));
    });

    it('never exposes internal identifiers, statuses, timestamps or contact phone', async () => {
      const controller = createController([slotRow('1')]);
      const serialized = JSON.stringify([
        ...(await controller.getPublicSlots()),
        await controller.getPublicSlotById('1'),
      ]);

      for (const field of [
        'ownerId',
        'approvalStatus',
        'phone',
        'status',
        'providerId',
        'serviceId',
        'categoryId',
        'createdAt',
        'updatedAt',
      ]) {
        expect(serialized).not.toContain(`"${field}"`);
      }
    });

    it('keeps BIGINT ids as strings', async () => {
      const [slot] = await createController([slotRow('9223372036854775807')]).getPublicSlots();

      expect(slot.id).toBe('9223372036854775807');
      expect(typeof slot.provider.id).toBe('string');
      expect(typeof slot.service.id).toBe('string');
    });
  });

  describe('input validation', () => {
    const pipe = new ParseBigIntIdPipe();

    it.each(['abc', '0', '-5', '1.5', '9223372036854775808'])(
      'rejects invalid id %p with 400',
      (id) => {
        expect(() => pipe.transform(id)).toThrow(BadRequestException);
      },
    );
  });

  describe('provider-owned availability CRUD stays protected', () => {
    it('keeps JwtAuthGuard and RolesGuard on AvailabilityController', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, AvailabilityController)).toEqual([
        JwtAuthGuard,
        RolesGuard,
      ]);
    });

    it('requires PROVIDER_OWNER on every management handler', () => {
      const handlers = Object.getOwnPropertyNames(
        AvailabilityController.prototype,
      ).filter((name) => name !== 'constructor');

      expect(handlers.length).toBeGreaterThan(0);

      for (const handler of handlers) {
        const method = (
          AvailabilityController.prototype as unknown as Record<string, object>
        )[handler];

        expect(Reflect.getMetadata(ROLES_KEY, method)).toEqual([
          'PROVIDER_OWNER',
        ]);
      }
    });
  });
});
