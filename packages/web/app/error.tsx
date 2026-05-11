'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

// Page-level error boundary. The nearest `error.tsx` ancestor catches client
// render exceptions inside its segment and keeps the rest of the app shell
// alive. The root `global-error.tsx` only fires when the root layout itself
// throws.
//
// This boundary lives outside the I18nProvider tree's guarantee that the
// `errors` namespace is preloaded, so we use the same inline-copy pattern as
// `global-error.tsx`. Keep these strings in sync with `errors.json#boundary.*`.
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

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale] = useState<LocaleKey>(detectLocale);
  const autoResetCountRef = useRef(0);
  const [autoResetting, setAutoResetting] = useState(false);

  useEffect(() => {
    if (isTranslatorDomError(error) && autoResetCountRef.current < MAX_AUTO_RESETS) {
      autoResetCountRef.current += 1;
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
