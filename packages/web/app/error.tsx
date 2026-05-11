'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

// Page-level error boundary. The nearest `error.tsx` ancestor catches client
// render exceptions inside its segment and keeps the rest of the app shell
// alive. The root `global-error.tsx` only fires when the root layout itself
// throws.
//
// HARDCODED COPY — DELIBERATE. This boundary renders when a render error has
// already broken the React tree, so it cannot depend on I18nProvider being
// alive or on the `errors` namespace being loaded. The strings below mirror
// `errors.json#boundary.{title,retry}` for the same locales — if you change
// one, update the other. Same pattern as `global-error.tsx`. `check:i18n`
// does not flag object-literal strings (only JSX text and certain
// attributes), so no i18n-ignore markers are required.
const COPY = {
  'en-US': {
    title: 'Something broke',
    retry: 'Try again',
  },
  es: {
    title: 'Algo se rompió',
    retry: 'Reintentar',
  },
} as const;

type LocaleKey = keyof typeof COPY;

function detectLocale(): LocaleKey {
  if (typeof window === 'undefined') return 'en-US';
  const { pathname } = window.location;
  if (pathname === '/es' || pathname.startsWith('/es/')) return 'es';
  return 'en-US';
}

// Heuristic for browser-extension DOM interference (Google Translate and
// similar). When the translator rewrites text nodes inside React-controlled
// subtrees, the reconciler trips with NotFoundError because the node it
// remembered is no longer where it expects. Auto-resetting recovers the page
// instead of leaving the user staring at an error screen. See issue #2064 for
// the Sentry breakdown.
function isTranslatorDomError(error: Error): boolean {
  const name = error.name ?? '';
  const message = error.message ?? '';
  if (name !== 'NotFoundError') return false;
  return (
    message.includes('removeChild') || message.includes('insertBefore') || message.includes('not a child of this node')
  );
}

// Limit auto-recovery attempts: a translator can keep mutating the page on
// every render, and an unbounded reset loop would burn battery and never
// settle. After one silent retry, we fall back to the visible error UI so the
// user is not stuck in an invisible loop.
const MAX_AUTO_RESETS = 1;

// Module-level counter so the auto-reset budget bounds total recoveries across
// the tab session, not just within a single mounted boundary. Without this,
// every navigation gives a fresh component instance with count = 0, so a
// persistently-mutating translator could trigger unlimited silent resets — one
// per page the user visits — and the user would never see the visible
// fallback. Persists for the lifetime of the tab.
let sessionAutoResetCount = 0;

// Test-only escape hatch. Production code must not call this.
export function __resetSessionAutoResetCountForTesting() {
  sessionAutoResetCount = 0;
}

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale] = useState<LocaleKey>(detectLocale);
  const [autoResetting, setAutoResetting] = useState(false);

  useEffect(() => {
    if (isTranslatorDomError(error) && sessionAutoResetCount < MAX_AUTO_RESETS) {
      sessionAutoResetCount += 1;
      setAutoResetting(true);
      // Sentry still captures so we can keep an eye on volume even after the
      // silent recovery succeeds. Defer the reset so React unmounts the error
      // boundary cleanly before re-rendering.
      Sentry.captureException(error, { tags: { autoRecovered: 'translator-dom' } });
      const handle = window.setTimeout(() => {
        reset();
      }, 0);
      return () => window.clearTimeout(handle);
    }
    // Either not a translator error, or the auto-reset budget is exhausted —
    // meaning the previous reset() did not clear the error. Surface the visible
    // fallback so the user is not stuck staring at a blank page.
    setAutoResetting(false);
    Sentry.captureException(error);
  }, [error, reset]);

  if (autoResetting) {
    return null;
  }

  const copy = COPY[locale];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60dvh',
        px: 3,
        py: 6,
        textAlign: 'center',
        gap: 2,
      }}
    >
      <Typography variant="h6" component="h2">
        {copy.title}
      </Typography>
      <Button variant="contained" onClick={() => reset()}>
        {copy.retry}
      </Button>
    </Box>
  );
}
