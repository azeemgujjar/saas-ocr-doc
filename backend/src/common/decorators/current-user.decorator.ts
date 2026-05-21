import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthContext, AuthenticatedRequest } from '../types/authenticated-request';

// Injects the auth context (or one field of it) into a handler param.
//   getMe(@CurrentUser() user: AuthContext) { ... }
export const CurrentUser = createParamDecorator(
  (data: keyof AuthContext | undefined, ctx: ExecutionContext): AuthContext | any => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return data ? request.user?.[data] : request.user;
  },
);

// Shortcut for just the tenantId.
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user?.tenantId;
  },
);
