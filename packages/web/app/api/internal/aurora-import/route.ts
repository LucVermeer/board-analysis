import { getServerSession } from 'next-auth/next';
import { type NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { authOptions } from '@/app/lib/auth/auth-options';
import { getDb } from '@/app/lib/db/db';
import {
  auroraExportSchema,
  importJsonExportData,
  type ImportResult,
  type ImportProgressEvent,
} from '@boardsesh/aurora-sync/json-import';
import { AURORA_BOARDS } from '@boardsesh/shared-schema';

export const maxDuration = 300;

const requestSchema = z.object({
  boardType: z.enum(AURORA_BOARDS),
  data: auroraExportSchema,
  skipFinalization: z.boolean().optional().default(false),
});

export type AuroraImportResponse = {
  success: boolean;
  results: ImportResult;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { boardType, data, skipFinalization } = parsed.data;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: ImportProgressEvent) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        };

        try {
          const results = await importJsonExportData(getDb(), session.user.id, boardType, data, send, {
            skipFinalization,
          });

          send({ type: 'complete', results });
        } catch (error) {
          console.error('Aurora JSON import error:', error);
          Sentry.captureException(error, {
            tags: { area: 'aurora-import', phase: 'server-stream' },
            extra: {
              boardType,
              userId: session.user.id,
              skipFinalization,
              dataCounts: {
                ascents: data.ascents.length,
                attempts: data.attempts.length,
                circuits: data.circuits.length,
                climbs: data.climbs.length,
              },
            },
          });
          send({ type: 'error', error: error instanceof Error ? error.message : 'Import failed' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Aurora JSON import error:', error);
    Sentry.captureException(error, { tags: { area: 'aurora-import', phase: 'server-route' } });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 500 });
  }
}
