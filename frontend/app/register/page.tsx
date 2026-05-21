'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setSession, ApiError } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    tenantName: '',
    tenantSlug: '',
    fullName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.register({
        tenantName: form.tenantName.trim(),
        tenantSlug: form.tenantSlug.trim().toLowerCase(),
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim() || undefined,
      });
      setSession(result);
      router.replace('/dashboard');
    } catch (err) {
      const apiErr = err as ApiError;
      setError(Array.isArray(apiErr.message) ? apiErr.message.join(', ') : apiErr.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold mb-1">Create a tenant</h1>
        <p className="text-sm text-[color:var(--text-dim)] mb-6">
          You'll be the owner of the new workspace.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Company name</label>
            <input
              className="input"
              value={form.tenantName}
              onChange={(e) => update('tenantName', e.target.value)}
              required
              placeholder="Acme Corporation"
            />
          </div>
          <div>
            <label className="label">Tenant slug (lowercase, used to log in)</label>
            <input
              className="input"
              value={form.tenantSlug}
              onChange={(e) => update('tenantSlug', e.target.value)}
              required
              pattern="^[a-z0-9-]+$"
              placeholder="acme"
            />
          </div>
          <div>
            <label className="label">Your name</label>
            <input
              className="input"
              value={form.fullName}
              onChange={(e) => update('fullName', e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password (min 8 characters)</label>
            <input
              className="input"
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="text-sm text-[color:var(--danger)] bg-[rgba(255,93,93,0.08)] border border-[rgba(255,93,93,0.3)] rounded p-3">
              {error}
            </div>
          )}

          <button className="btn w-full" type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create tenant & sign in'}
          </button>
        </form>

        <p className="text-sm text-[color:var(--text-dim)] mt-6 text-center">
          Already have an account?{' '}
          <Link href="/login" className="text-[color:var(--accent)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
