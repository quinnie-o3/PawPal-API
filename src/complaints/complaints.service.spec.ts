import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { DataSource } from 'typeorm';

import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Booking } from '../bookings/entities/booking.entity';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';
import { Complaint } from './entities/complaint.entity';

describe('ComplaintsService', () => {
  const customerId = '10';

  let booking: Partial<Booking> | null;
  let storedComplaints: Complaint[];
  let complaintsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let service: ComplaintsService;

  beforeEach(() => {
    booking = { id: '20', customerId, status: 'COMPLETED' };
    storedComplaints = [];

    complaintsRepository = {
      create: jest.fn((value: Partial<Complaint>) => ({ ...value })),
      save: jest.fn((value: Complaint) => {
        const saved = { ...value, id: String(storedComplaints.length + 1) };
        storedComplaints.push(saved);
        return Promise.resolve(saved);
      }),
      find: jest.fn(({ where }: { where: { createdBy: string } }) =>
        Promise.resolve(
          storedComplaints.filter((c) => c.createdBy === where.createdBy),
        ),
      ),
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(storedComplaints.find((c) => c.id === where.id) ?? null),
      ),
    };

    const repositories = new Map<unknown, unknown>([
      [Booking, { findOne: jest.fn(() => Promise.resolve(booking)) }],
      [Complaint, complaintsRepository],
    ]);

    service = new ComplaintsService({
      getRepository: jest.fn((entity: unknown) => repositories.get(entity)),
    } as unknown as DataSource);
  });

  describe('createComplaint', () => {
    it('creates an OPEN complaint for the owner of the booking', async () => {
      await expect(
        service.createComplaint(customerId, '20', { reason: 'Late arrival' }),
      ).resolves.toMatchObject({
        bookingId: '20',
        createdBy: customerId,
        reason: 'Late arrival',
        status: 'OPEN',
        adminNote: null,
        resolvedBy: null,
        resolvedAt: null,
      });
    });

    it('rejects another customer with 403 and creates nothing', async () => {
      await expect(
        service.createComplaint('99', '20', { reason: 'Late arrival' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(complaintsRepository.save).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing booking and creates nothing', async () => {
      booking = null;

      await expect(
        service.createComplaint(customerId, '20', { reason: 'Late arrival' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(complaintsRepository.save).not.toHaveBeenCalled();
    });

    // Current-behavior baselines (policy not yet approved; see C-05 report).
    it('currently allows multiple complaints for the same booking', async () => {
      await service.createComplaint(customerId, '20', { reason: 'First' });
      await service.createComplaint(customerId, '20', { reason: 'Second' });

      expect(storedComplaints).toHaveLength(2);
    });

    it.each(['PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'NO_SHOW'])(
      'currently allows a complaint for a %s booking',
      async (status) => {
        booking = { id: '20', customerId, status: status as Booking['status'] };

        await expect(
          service.createComplaint(customerId, '20', { reason: 'Issue' }),
        ).resolves.toMatchObject({ status: 'OPEN' });
      },
    );
  });

  describe('complaint queries', () => {
    it('lists only the caller’s complaints, newest first', async () => {
      await service.createComplaint(customerId, '20', { reason: 'Mine' });

      await expect(service.getMyComplaints(customerId)).resolves.toHaveLength(1);
      expect(complaintsRepository.find).toHaveBeenCalledWith({
        where: { createdBy: customerId },
        order: { createdAt: 'DESC' },
      });
      await expect(service.getMyComplaints('99')).resolves.toEqual([]);
    });

    it('returns the caller’s complaint by id', async () => {
      const created = await service.createComplaint(customerId, '20', {
        reason: 'Mine',
      });

      await expect(
        service.getMyComplaintById(customerId, created.id),
      ).resolves.toMatchObject({ id: created.id, reason: 'Mine' });
    });

    it('rejects reading another customer’s complaint with 403', async () => {
      const created = await service.createComplaint(customerId, '20', {
        reason: 'Mine',
      });

      await expect(
        service.getMyComplaintById('99', created.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 404 for a missing complaint', async () => {
      await expect(
        service.getMyComplaintById(customerId, '999'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('route protection', () => {
    it('applies JwtAuthGuard and RolesGuard to every complaint route', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, ComplaintsController)).toEqual([
        JwtAuthGuard,
        RolesGuard,
      ]);
    });

    it('restricts every handler to CUSTOMER', () => {
      const handlers = Object.getOwnPropertyNames(
        ComplaintsController.prototype,
      ).filter((name) => name !== 'constructor');

      for (const handler of handlers) {
        const method = (
          ComplaintsController.prototype as unknown as Record<string, object>
        )[handler];

        expect(Reflect.getMetadata(ROLES_KEY, method)).toEqual(['CUSTOMER']);
      }
    });
  });
});
