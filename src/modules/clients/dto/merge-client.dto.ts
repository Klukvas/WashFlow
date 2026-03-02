import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';

@ValidatorConstraint({ name: 'notEqual', async: false })
class NotEqualConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints as string[];
    const relatedValue = (args.object as Record<string, unknown>)[
      relatedPropertyName
    ];
    return args.value !== relatedValue;
  }

  defaultMessage(args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints as string[];
    return `${args.property} must not be equal to ${relatedPropertyName}`;
  }
}

class MergeFieldOverridesDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MergeClientDto {
  @IsUUID()
  sourceClientId: string;

  @IsUUID()
  @Validate(NotEqualConstraint, ['sourceClientId'])
  targetClientId: string;

  @ValidateNested()
  @Type(() => MergeFieldOverridesDto)
  fieldOverrides: MergeFieldOverridesDto;
}
