'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setSession, ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState('demo');
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('Demo1234!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.login(tenantSlug.trim(), email.trim(), password);
      setSession(result);
      router.replace('/dashboard');
    } catch (err) {
      const apiErr = err as ApiError;
      setError(Array.isArray(apiErr.message) ? apiErr.message.join(', ') : apiErr.message);
    } finally {
      setLoading(false);
    }
  }

  const services = [
    {
      name: 'Frontend',
      purpose: 'This web app — login, upload, view results',
      url: 'http://localhost:3000',
    },
    {
      name: 'API',
      purpose: 'REST API base — auth & document endpoints',
      url: 'http://localhost:3001/api/v1',
    },
    {
      name: 'API docs',
      purpose: 'Interactive Swagger / OpenAPI explorer',
      url: 'http://localhost:3001/api/docs',
    },
    {
      name: 'API health',
      purpose: 'Liveness / readiness check for the API',
      url: 'http://localhost:3001/api/v1/health',
    },
    {
      name: 'OCR service',
      purpose: 'Tesseract OCR microservice health check',
      url: 'http://localhost:4000/health',
    },
  ];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-5 p-6">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-[color:var(--text-dim)] mb-6">
          Use the seeded demo account or your own registered tenant.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Tenant slug</label>
            <input
              className="input"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              required
              autoComplete="organization"
              placeholder="acme"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-sm text-[color:var(--danger)] bg-[rgba(255,93,93,0.08)] border border-[rgba(255,93,93,0.3)] rounded p-3">
              {error}
            </div>
          )}

          <button className="btn w-full" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-sm text-[color:var(--text-dim)] mt-6 text-center">
          No account?{' '}
          <Link href="/register" className="text-[color:var(--accent)] hover:underline">
            Create a tenant
          </Link>
        </p>
      </div>

      <div className="card w-full max-w-md p-6">
        <h2 className="text-sm font-semibold mb-1">Service endpoints</h2>
        <p className="text-xs text-[color:var(--text-dim)] mb-4">
          The URLs that make up this stack and what each one is for.
        </p>
        <ul className="space-y-3">
          {services.map((s) => (
            <li key={s.name} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{s.name}</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[color:var(--accent)] hover:underline break-all text-right"
                >
                  {s.url}
                </a>
              </div>
              <p className="text-xs text-[color:var(--text-dim)] mt-0.5">
                {s.purpose}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
