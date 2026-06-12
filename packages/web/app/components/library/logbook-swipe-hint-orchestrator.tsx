'use client';

import { useEffect, useRef } from 'react';
import { getPreference, setPreference } from '@/app/lib/user-preferences-db';
import { DEFAULT_CONFIRMATION_PEEK_OFFSET } from '@/app/hooks/use-swipe-actions';

const PREF_KEY = 'swipeHint:logbookSeen' as const;
const INITIAL_DELAY_MS = 1500;
// Matches the confirmation peek users see after a real swipe-left commit,
// so the hint previews the exact resting state of the gesture.
const PEEK_DISTANCE = DEFAULT_CONFIRMATION_PEEK_OFFSET;
const SLIDE_OUT_MS = 400;
const HOLD_MS = 600;
const SLIDE_BACK_MS = 300;
const GAP_BETWEEN_MS = 300;
export const REPEAT_COUNT = 2;
// Each iteration invokes element.animate() 4 times: slide out, fade in,
// slide back, fade out. Exported so tests stay in sync if the sequence changes.
export const ANIMATIONS_PER_CYCLE = 4;

/**
 * Plays a one-time swipe-hint animation on the first logbook feed item.
 * Briefly slides the item left twice to reveal the "edit" action,
 * then slides it back. Uses the Web Animations API for compositor-thread
 * performance. Renders no visible DOM.
 *
 * Mirrors the climb-list SwipeHintOrchestrator. The first LogbookFeedItem
 * opts in with `id="onboarding-logbook-card"` and its right action layer
 * is marked with `data-swipe-right-action`.
 */
export default function LogbookSwipeHintOrchestrator() {
  const animationsRef = useRef<Animation[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Collect every timer we schedule so unmount can clear all of them.
    // A single `let timer` would only track the most recently assigned id.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (cb: () => void, ms: number) => {
      const id = setTimeout(cb, ms);
      timers.push(id);
      return id;
    };

    const run = async () => {
      const seen = await getPreference<boolean>(PREF_KEY);
      if (cancelled || seen) return;
      if (!window.matchMedia('(pointer: coarse)').matches) return;

      schedule(async () => {
        if (cancelled) return;

        const contentEl = document.querySelector<HTMLElement>('#onboarding-logbook-card [data-swipe-content]');
        const actionEl = document.querySelector<HTMLElement>('#onboarding-logbook-card [data-swipe-right-action]');
        if (!contentEl || !actionEl) return;

        const iconLayer = actionEl.firstElementChild as HTMLElement | null;

        try {
          for (let i = 0; i < REPEAT_COUNT; i++) {
            if (cancelled) return;

            // Show action layer
            actionEl.style.visibility = 'visible';
            if (iconLayer) iconLayer.style.opacity = '1';

            // Slide out
            const slideOut = contentEl.animate(
              [{ transform: 'translateX(0)' }, { transform: `translateX(-${PEEK_DISTANCE}px)` }],
              { duration: SLIDE_OUT_MS, easing: 'ease-out', fill: 'forwards' },
            );
            const fadeIn = actionEl.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: SLIDE_OUT_MS,
              easing: 'ease-out',
              fill: 'forwards',
            });
            animationsRef.current.push(slideOut, fadeIn);

            await slideOut.finished;
            if (cancelled) return;

            // Hold
            await new Promise<void>((r) => {
              schedule(r, HOLD_MS);
            });
            if (cancelled) return;

            // Slide back
            const slideBack = contentEl.animate(
              [{ transform: `translateX(-${PEEK_DISTANCE}px)` }, { transform: 'translateX(0)' }],
              { duration: SLIDE_BACK_MS, easing: 'ease-out', fill: 'forwards' },
            );
            const fadeOut = actionEl.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: SLIDE_BACK_MS,
              easing: 'ease-out',
              fill: 'forwards',
            });
            animationsRef.current.push(slideBack, fadeOut);

            await slideBack.finished;
            if (cancelled) return;

            // Clean up inline styles
            contentEl.style.transform = '';
            actionEl.style.opacity = '';
            actionEl.style.visibility = '';
            if (iconLayer) iconLayer.style.opacity = '';

            // Gap before next repeat
            if (i < REPEAT_COUNT - 1) {
              await new Promise<void>((r) => {
                schedule(r, GAP_BETWEEN_MS);
              });
            }
          }

          if (!cancelled) {
            // Fire-and-forget: if this write fails, the hint replays next visit.
            setPreference(PREF_KEY, true).catch(() => {});
          }
        } catch {
          // Animation cancelled
        }
      }, INITIAL_DELAY_MS);
    };

    void run();

    return () => {
      cancelled = true;
      for (const id of timers) clearTimeout(id);
      for (const anim of animationsRef.current) anim.cancel();
      animationsRef.current = [];
    };
  }, []);

  return null;
}
