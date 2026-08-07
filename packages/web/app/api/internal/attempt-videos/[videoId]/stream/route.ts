import 'server-only';
import { getServerAuthToken } from '@/app/lib/auth/server-auth';
import { getBackendHttpUrl } from '@/app/lib/backend-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORWARDED_RESPONSE_HEADERS = [
  'accept-ranges',
  'content-length',
  'content-range',
  'content-type',
  'x-content-type-options',
];

async function proxyAttemptVideo(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const { videoId } = await params;
  if (!UUID_PATTERN.test(videoId)) return new Response('Not found', { status: 404 });

  const [token, backendUrl] = await Promise.all([getServerAuthToken(), Promise.resolve(getBackendHttpUrl())]);
  if (!token) return new Response('Authentication required', { status: 401 });
  if (!backendUrl) return new Response('Video service unavailable', { status: 503 });

  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const range = request.headers.get('range');
  if (range) headers.set('Range', range);

  let upstream: Response;
  try {
    upstream = await fetch(`${backendUrl}/api/private-attempt-videos/${videoId}/stream`, {
      method: request.method,
      headers,
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[AttemptVideoProxy] Backend request failed:', error);
    return new Response('Video service unavailable', { status: 503 });
  }

  const responseHeaders = new Headers({ 'Cache-Control': 'private, no-store' });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  if (!upstream.ok && upstream.status !== 416) {
    await upstream.body?.cancel();
    return new Response(upstream.status === 404 ? 'Not found' : 'Video request failed', {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxyAttemptVideo;
export const HEAD = proxyAttemptVideo;
