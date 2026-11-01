import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ParseBigIntIdPipe } from '../common/pipes/parse-bigint-id.pipe';
import { AvailabilityService } from './availability.service';

const PUBLIC_SLOT_SCHEMA = {
  type: 'object',
  required: [
    'id',
    'slotDate',
    'startTime',
    'endTime',
    'capacity',
    'bookedCount',
    'service',
    'provider',
  ],
  properties: {
    id: {
      type: 'string',
      description: 'BIGINT identifier serialized as a string.',
      example: '12',
    },
    slotDate: { type: 'string', format: 'date', example: '2026-12-01' },
    startTime: { type: 'string', example: '09:00:00' },
    endTime: { type: 'string', example: '10:00:00' },
    capacity: { type: 'integer', example: 3 },
    bookedCount: { type: 'integer', example: 1 },
    service: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '5' },
        name: { type: 'string', example: 'Full grooming' },
        description: { type: 'string', nullable: true },
        price: {
          type: 'string',
          description: 'NUMERIC(12,2) serialized as a string.',
          example: '150000.00',
        },
        durationMinutes: { type: 'integer', example: 60 },
        category: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '1' },
            name: { type: 'string', example: 'Grooming' },
            description: { type: 'string', nullable: true },
          },
        },
      },
    },
    provider: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '3' },
        businessName: { type: 'string', example: 'Paw Spa' },
        address: { type: 'string', example: '1 Nguyen Hue, District 1' },
        description: { type: 'string', nullable: true },
        ratingAvg: { type: 'string', example: '4.50' },
        ratingCount: { type: 'integer', example: 2 },
      },
    },
  },
};

@ApiTags('Public Availability')
@Controller('availability/public')
export class PublicAvailabilityController {
  constructor(
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get publicly bookable availability slots',
  })
  @ApiOkResponse({
    description:
      'Returns future open slots with remaining capacity from approved providers, active services and active categories. Public endpoint; no authentication required.',
    schema: { type: 'array', items: PUBLIC_SLOT_SCHEMA },
  })
  getPublicSlots() {
    return this.availabilityService.getPublicSlots();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one publicly bookable availability slot',
  })
  @ApiOkResponse({
    description:
      'Available slot returned successfully. Public endpoint; no authentication required.',
    schema: PUBLIC_SLOT_SCHEMA,
  })
  @ApiBadRequestResponse({
    description: 'Availability slot ID is invalid.',
  })
  @ApiNotFoundResponse({
    description:
      'The slot does not exist or is not currently bookable.',
  })
  getPublicSlotById(
    @Param('id', ParseBigIntIdPipe)
    slotId: string,
  ) {
    return this.availabilityService.getPublicSlotById(
      slotId,
    );
  }
}