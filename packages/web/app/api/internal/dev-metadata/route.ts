import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export type DevMetadataResponse = {
  branchName: string | null;
  qaNotes: string | null;
  qaNotesFilePath: string | null;
};

function nonEmptyEnvValue(key: string): string | null {
  const value = process.env[key]?.trim();
  return value ? value : null;
}

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const response: DevMetadataResponse = {
    branchName: nonEmptyEnvValue('BOARDSESH_DEV_BRANCH_NAME'),
    qaNotes: nonEmptyEnvValue('BOARDSESH_DEV_QA_NOTES'),
    qaNotesFilePath: nonEmptyEnvValue('BOARDSESH_DEV_QA_NOTES_FILE'),
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
