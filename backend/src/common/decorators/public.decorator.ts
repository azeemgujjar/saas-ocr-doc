import { SetMetadata } from '@nestjs/common';

// Marks a route as public so JwtAuthGuard lets it through.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
