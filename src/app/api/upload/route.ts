import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaff, NotAuthorizedError } from '@/lib/admin/auth';
import { isSupabaseConfigured } from '@/lib/demo';

/**
 * ============================================================================
 * ASSET UPLOAD
 * ============================================================================
 * Logos, hero images, service photography, and provider headshots.
 *
 * Uploads are proxied through the server rather than going browser-direct so
 * the size and type limits below are actually enforced. A bucket policy alone
 * would let a signed-in manager push a 40MB TIFF as a logo.
 * ============================================================================
 */

const BUCKETS = {
  brand: { bucket: 'brand', maxBytes: 5 * 1024 * 1024 },
  media: { bucket: 'media', maxBytes: 10 * 1024 * 1024 },
  client: { bucket: 'client', maxBytes: 20 * 1024 * 1024 },
} as const;

const ALLOWED = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/avif',
]);

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Uploads need Supabase Storage. Connect a project first — see SETUP.md.' },
      { status: 503 }
    );
  }

  let ctx;
  try {
    ctx = await requireStaff('manager');
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof NotAuthorizedError ? err.message : 'Not authorized.' },
      { status: 403 }
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  const kindParam = String(formData?.get('kind') ?? 'brand');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  }

  const target = BUCKETS[kindParam as keyof typeof BUCKETS] ?? BUCKETS.brand;

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: 'Use a PNG, JPG, WebP, or SVG.' },
      { status: 415 }
    );
  }

  if (file.size > target.maxBytes) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1_048_576).toFixed(1)}MB. The limit is ${target.maxBytes / 1_048_576}MB.` },
      { status: 413 }
    );
  }

  const supabase = createAdminClient();
  const extension = EXTENSIONS[file.type] ?? 'bin';
  // Namespaced by business, and cache-busted by timestamp so a replaced logo
  // is not served stale from the CDN for hours.
  const path = `${ctx.businessId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;

  const { error } = await supabase.storage
    .from(target.bucket)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json(
      { error: `Upload failed: ${error.message}` },
      { status: 500 }
    );
  }

  const { data } = supabase.storage.from(target.bucket).getPublicUrl(path);

  return NextResponse.json({
    url: data.publicUrl,
    path,
    bucket: target.bucket,
    sizeBytes: file.size,
  });
}
