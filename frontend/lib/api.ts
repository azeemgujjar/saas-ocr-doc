// Fetch wrapper for the backend API. Adds the Authorization header, and on a
// 401 it tries the refresh token once and retries the request.
// Tokens live in localStorage — fine for a demo, but a real app should use
// httpOnly cookies to keep them away from XSS.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: string;
    tenantId: string;
    tenantSlug: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  };
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
}

const STORAGE_KEYS = {
  access: 'idp_access_token',
  refresh: 'idp_refresh_token',
  user: 'idp_user',
} as const;

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.access);
}
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.refresh);
}
export function getCurrentUser(): AuthResponse['user'] | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  return raw ? JSON.parse(raw) : null;
}
export function setSession(auth: AuthResponse) {
  localStorage.setItem(STORAGE_KEYS.access, auth.tokens.accessToken);
  localStorage.setItem(STORAGE_KEYS.refresh, auth.tokens.refreshToken);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(auth.user));
}
export function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.access);
  localStorage.removeItem(STORAGE_KEYS.refresh);
  localStorage.removeItem(STORAGE_KEYS.user);
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  localStorage.setItem(STORAGE_KEYS.access, data.accessToken);
  localStorage.setItem(STORAGE_KEYS.refresh, data.refreshToken);
  return true;
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const accessToken = getAccessToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  // let the browser set the multipart boundary for FormData
  if (!(init.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let response = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (response.status === 401 && accessToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newAccess = getAccessToken();
      headers['Authorization'] = `Bearer ${newAccess}`;
      response = await fetch(`${API_BASE}${path}`, { ...init, headers });
    }
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err: ApiError = body ?? {
      statusCode: response.status,
      error: response.statusText,
      message: 'Request failed',
    };
    throw err;
  }
  return body as T;
}

export const api = {
  login: (tenantSlug: string, email: string, password: string) =>
    apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ tenantSlug, email, password }),
    }),

  register: (input: {
    tenantName: string;
    tenantSlug: string;
    email: string;
    password: string;
    fullName?: string;
  }) =>
    apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  me: () => apiFetch<any>('/auth/me'),

  uploadDocument: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiFetch<any>('/documents/upload', { method: 'POST', body: fd });
  },

  listDocuments: (params: { page?: number; pageSize?: number; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs}` : '';
    return apiFetch<any>(`/documents${suffix}`);
  },

  getDocument: (id: string) => apiFetch<any>(`/documents/${id}`),
};
