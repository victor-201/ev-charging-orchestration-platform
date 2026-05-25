import {
  IsString, IsOptional, IsUrl, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsUrl({}, { message: 'Invalid Avatar URL' })
  @MaxLength(500)
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim() ?? null)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value?.trim() ?? null)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim() ?? null)
  dateOfBirth?: string | null;
}
