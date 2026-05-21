'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, clearSession, getAccessToken, getCurrentUser, ApiError } from '@/lib/api';

interface DocRow {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  processedAt: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(getCurrentUser());
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const result = await api.listDocuments({ pageSize: 50 });
      setDocs(result.items);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.statusCode === 401) {
        clearSession();
        router.replace('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    fetchDocs();
    // Poll while any document is still processing
    const interval = setInterval(fetchDocs, 3000);
    return () => clearInterval(interval);
  }, [fetchDocs, router]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      await api.uploadDocument(file);
      if (fileInput.current) fileInput.current.value = '';
      await fetchDocs();
    } catch (err) {
      const apiErr = err as ApiError;
      setUploadError(Array.isArray(apiErr.message) ? apiErr.message.join(', ') : apiErr.message);
    } finally {
      setUploading(false);
    }
  }

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          {user && (
            <>
              <p className="text-sm text-[color:var(--text-dim)]">
                {user.tenantSlug} · {user.email} · {user.role}
              </p>
              <p className="text-xs text-[color:var(--text-dim)] mt-1">
                Workspace URL:{' '}
                <span className="font-mono">{user.tenantSlug}.idp.example.com</span>{' '}
                <span className="opacity-70">(subdomain access planned for production)</span>
              </p>
            </>
          )}
        </div>
        <button className="btn-ghost" onClick={handleLogout}>Sign out</button>
      </header>

      <section className="card p-6 mb-6">
        <h2 className="text-lg font-medium mb-3">Upload a document</h2>
        <p className="text-sm text-[color:var(--text-dim)] mb-4">
          JPEG, PNG, or WebP image. Max 10MB. Text is extracted with OCR asynchronously.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            className="text-sm file:btn file:mr-3 file:cursor-pointer cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          {uploading && (
            <span className="text-sm text-[color:var(--text-dim)]">Uploading…</span>
          )}
        </div>
        {uploadError && (
          <div className="text-sm text-[color:var(--danger)] mt-3 bg-[rgba(255,93,93,0.08)] border border-[rgba(255,93,93,0.3)] rounded p-3">
            {uploadError}
          </div>
        )}
      </section>

      <section className="card p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">History</h2>
          <button className="btn-ghost text-sm" onClick={fetchDocs}>Refresh</button>
        </div>

        {loading ? (
          <p className="text-sm text-[color:var(--text-dim)]">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-[color:var(--text-dim)]">
            No documents yet. Upload one above to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[color:var(--text-dim)] border-b border-[color:var(--border)]">
                <tr>
                  <th className="py-2 pr-3 font-normal">Name</th>
                  <th className="py-2 pr-3 font-normal">Type</th>
                  <th className="py-2 pr-3 font-normal">Size</th>
                  <th className="py-2 pr-3 font-normal">Status</th>
                  <th className="py-2 pr-3 font-normal">Uploaded</th>
                  <th className="py-2 pr-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-[color:var(--border)]/50">
                    <td className="py-2 pr-3 truncate max-w-[220px]">{d.originalName}</td>
                    <td className="py-2 pr-3 text-[color:var(--text-dim)]">{d.mimeType}</td>
                    <td className="py-2 pr-3 text-[color:var(--text-dim)]">
                      {formatBytes(d.sizeBytes)}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--text-dim)]">
                      {new Date(d.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Link
                        href={`/documents/${d.id}`}
                        className="text-[color:var(--accent)] hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: DocRow['status'] }) {
  const cls = {
    PENDING: 'badge badge-pending',
    PROCESSING: 'badge badge-processing',
    COMPLETED: 'badge badge-completed',
    FAILED: 'badge badge-failed',
  }[status];
  return <span className={cls}>{status.toLowerCase()}</span>;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
