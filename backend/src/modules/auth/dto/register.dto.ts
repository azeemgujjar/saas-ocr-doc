import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Acme Corporation', description: 'Tenant (company) display name' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tenantName: string;

  @ApiProperty({ example: 'acme', description: 'URL-safe tenant slug, lowercase' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must contain only lowercase letters, digits, and hyphens' })
  tenantSlug: string;

  @ApiProperty({ example: 'jane@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'CorrectHorseBatteryStaple1!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Jane Doe', required: false })
  @IsString()
  @MaxLength(100)
  fullName?: string;
}
