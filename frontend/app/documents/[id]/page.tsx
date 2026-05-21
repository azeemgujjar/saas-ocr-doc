'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, getAccessToken, ApiError, clearSession } from '@/lib/api';

interface Doc {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorMessage: string | null;
  extractedData: unknown;
  createdAt: string;
  processingStartedAt: string | null;
  processedAt: string | null;
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDoc = useCallback(async () => {
    try {
      const result = await api.getDocument(params.id);
      setDoc(result);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.statusCode === 401) {
        clearSession();
        router.replace('/login');
        return;
      }
      setError(Array.isArray(apiErr.message) ? apiErr.message.join(', ') : apiErr.message);
    }
  }, [params.id, router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    fetchDoc();
  }, [fetchDoc, router]);

  // Poll while not in a terminal state
  useEffect(() => {
    if (!doc) return;
    if (doc.status === 'COMPLETED' || doc.status === 'FAILED') return;
    const interval = setInterval(fetchDoc, 2000);
    return () => clearInterval(interval);
  }, [doc, fetchDoc]);

  if (error) {
    return (
      <main className="min-h-screen p-6 max-w-3xl mx-auto">
        <Link href="/dashboard" className="text-sm text-[color:var(--accent)] hover:underline">
          ← Back to dashboard
        </Link>
        <div className="card p-6 mt-4 text-[color:var(--danger)]">{error}</div>
      </main>
    );
  }

  if (!doc) {
    return (
      <main className="min-h-screen p-6 max-w-3xl mx-auto">
        <p className="text-sm text-[color:var(--text-dim)]">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <Link href="/dashboard" className="text-sm text-[color:var(--accent)] hover:underline">
        ← Back to dashboard
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-semibold break-all">{doc.originalName}</h1>
        <p className="text-sm text-[color:var(--text-dim)] mt-1">
          {doc.mimeType} · {(doc.sizeBytes / 1024).toFixed(1)} KB · uploaded{' '}
          {new Date(doc.createdAt).toLocaleString()}
        </p>
      </header>

      <section className="card p-6 mb-4">
        <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-dim)] mb-3">
          Processing status
        </h2>
        <StatusDisplay doc={doc} />
      </section>

      {doc.status === 'COMPLETED' && doc.extractedData ? (
        <section className="card p-6">
          <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-dim)] mb-3">
            Extracted data
          </h2>
          <pre className="text-xs bg-[color:var(--panel-2)] border border-[color:var(--border)] rounded p-4 overflow-x-auto">
            {JSON.stringify(doc.extractedData, null, 2)}
          </pre>
        </section>
      ) : doc.status === 'FAILED' ? (
        <section className="card p-6 border-[rgba(255,93,93,0.3)]">
          <h2 className="text-sm uppercase tracking-wide text-[color:var(--danger)] mb-2">
            Processing failed
          </h2>
          <p className="text-sm">{doc.errorMessage ?? 'No error details available.'}</p>
        </section>
      ) : (
        <section className="card p-6">
          <p className="text-sm text-[color:var(--text-dim)]">
            Processing in progress. This page polls every 2 seconds and will update automatically.
          </p>
        </section>
      )}
    </main>
  );
}

function StatusDisplay({ doc }: { doc: Doc }) {
  const status = doc.status;
  const className = {
    PENDING: 'badge badge-pending',
    PROCESSING: 'badge badge-processing',
    COMPLETED: 'badge badge-completed',
    FAILED: 'badge badge-failed',
  }[status];

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <span className={className}>{status.toLowerCase()}</span>
      {doc.processingStartedAt && (
        <span className="text-xs text-[color:var(--text-dim)]">
          Started: {new Date(doc.processingStartedAt).toLocaleString()}
        </span>
      )}
      {doc.processedAt && (
        <span className="text-xs text-[color:var(--text-dim)]">
          Finished: {new Date(doc.processedAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}
