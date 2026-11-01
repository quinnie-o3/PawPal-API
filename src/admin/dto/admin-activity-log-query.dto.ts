import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateBy,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import {
  ADMIN_ACTIVITY_ACTIONS,
  ADMIN_ACTIVITY_TARGET_TYPES,
  type AdminActivityAction,
  type AdminActivityTargetType,
} from '../admin-activity-log.constants';
import { isPostgresBigIntId } from '../../common/pipes/parse-bigint-id.pipe';
import { toNumberIfNumericString } from '../../common/utils/strict-input.util';

export class AdminActivityLogQueryDto {
  @ApiPropertyOptional({ enum: ADMIN_ACTIVITY_ACTIONS })
  @IsOptional()
  @IsIn(ADMIN_ACTIVITY_ACTIONS)
  action?: AdminActivityAction;

  @ApiPropertyOptional({ enum: ADMIN_ACTIVITY_TARGET_TYPES })
  @IsOptional()
  @IsIn(ADMIN_ACTIVITY_TARGET_TYPES)
  targetType?: AdminActivityTargetType;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @ValidateBy({
    name: 'isPostgresBigIntId',
    validator: {
      validate: (value: unknown) => isPostgresBigIntId(value),
      defaultMessage: () => 'targetId must be a valid positive integer ID',
    },
  })
  targetId?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @ValidateBy({
    name: 'isPostgresBigIntId',
    validator: {
      validate: (value: unknown) => isPostgresBigIntId(value),
      defaultMessage: () => 'adminUserId must be a valid positive integer ID',
    },
  })
  adminUserId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => toNumberIfNumericString(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => toNumberIfNumericString(value))
  @IsInt()
  @Min(0)
  offset: number = 0;
}
