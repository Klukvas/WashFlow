import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateVehicleDto } from './create-vehicle.dto';

export class UpdateVehicleDto extends PartialType(
  OmitType(CreateVehicleDto, ['clientId']),
) {}
