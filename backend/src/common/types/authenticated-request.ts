import { Request } from 'express';

// What ends up on req.user after an auth guard passes. JWT and API-key auth
// both fill the same shape so handlers don't care which was used.
export interface AuthContext {
  userId: string | null;     // null when authenticated via API key
  tenantId: string;
  email: string | null;
  role: string | null;
  authMethod: 'jwt' | 'api_key';
  apiKeyId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthContext;
}
