'use client';

import { useCallback } from 'react';
import confetti from 'canvas-confetti';
import { themeTokens } from '@/app/theme/theme-config';

export type ConfettiVariant = 'ascent' | 'attempt' | 'flash';

/**
 * Generates a small lightning bolt polygon path string (relative coordinates)
 * that can be placed in an SVG <path> with a transform for positioning/rotation.
 * The bolt is ~24px tall, ~10px wide, pointing "up" (negative y direction).
 */
function buildBoltShape(): string {
  // A zigzag lightning bolt polygon (~32px tall, ~16px wide)
  return 'M 0,-16 L 6,-5 L 2,-5 L 7,5 L 3,5 L 8,16 L -1,4 L 3,4 L -3,-4 L 1,-4 L -4,-16 Z';
}

let activeOverlay: HTMLElement | null = null;

/**
 * Fires small solid lightning bolt shapes radiating outward from the target
 * element's edge. The overlay is appended to document.body so it's independent
 * of React's render tree and survives component unmounts.
 */
function fireThunderstrike(targetElement: HTMLElement) {
  // Respect reduced motion preference
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  // Prevent stacked overlays from rapid double-taps
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }

  const rect = targetElement.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const buttonRadius = Math.max(rect.width, rect.height) / 2;

  const boltCount = 6;
  const boltShape = buildBoltShape();
  let bolts = '';

  for (let i = 0; i < boltCount; i++) {
    const angle = (i / boltCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const startDist = buttonRadius + 4 + Math.random() * 4;
    const x = cx + Math.cos(angle) * startDist;
    const y = cy + Math.sin(angle) * startDist;
    // Rotate bolt to point outward (angle in degrees, offset by 90 since bolt points up)
    const rotDeg = (angle * 180) / Math.PI + 90;
    // Each bolt translates outward during animation
    const tx = Math.cos(angle) * 35;
    const ty = Math.sin(angle) * 35;
    const delay = (Math.random() * 0.04).toFixed(3);

    bolts += `
      <g style="animation: bolt-fly 0.25s ${delay}s ease-out both"
         transform="translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${rotDeg.toFixed(1)})"
         data-tx="${tx.toFixed(1)}" data-ty="${ty.toFixed(1)}">
        <path d="${boltShape}" fill="#FDE74C" stroke="#333" stroke-width="2"
              stroke-linejoin="round"/>
      </g>`;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: ${themeTokens.zIndex.animation};
    pointer-events: none;
  `;
  overlay.innerHTML = `
    <svg width="100%" height="100%" style="position:absolute;inset:0;overflow:visible">
      ${bolts}
    </svg>
    <style>
      @keyframes bolt-fly {
        0% { opacity: 0; transform: translate(var(--x), var(--y)) rotate(var(--r)) scale(0.5); }
        20% { opacity: 1; transform: translate(var(--x), var(--y)) rotate(var(--r)) scale(1); }
        100% { opacity: 0; transform: translate(calc(var(--x) + var(--tx)), calc(var(--y) + var(--ty))) rotate(var(--r)) scale(0.8); }
      }
    </style>
  `;

  // Apply CSS custom properties to each bolt for the animation
  const groups = overlay.querySelectorAll('g[data-tx]');
  groups.forEach((g) => {
    const el = g as HTMLElement;
    const transform = el.getAttribute('transform') || '';
    const txVal = el.dataset.tx || '0';
    const tyVal = el.dataset.ty || '0';
    // Extract translate and rotate from the transform attribute
    const translateMatch = transform.match(/translate\(([\d.-]+),\s*([\d.-]+)\)/);
    const rotateMatch = transform.match(/rotate\(([\d.-]+)\)/);
    const xPos = translateMatch ? translateMatch[1] : '0';
    const yPos = translateMatch ? translateMatch[2] : '0';
    const rot = rotateMatch ? rotateMatch[1] : '0';
    el.style.setProperty('--x', `${xPos}px`);
    el.style.setProperty('--y', `${yPos}px`);
    el.style.setProperty('--r', `${rot}deg`);
    el.style.setProperty('--tx', `${txVal}px`);
    el.style.setProperty('--ty', `${tyVal}px`);
    // Remove the static transform since animation handles positioning
    el.removeAttribute('transform');
  });

  document.body.appendChild(overlay);
  activeOverlay = overlay;
  setTimeout(() => {
    overlay.remove();
    if (activeOverlay === overlay) activeOverlay = null;
  }, 300);

  // Pulse the button itself (expand then contract)
  targetElement.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], {
    duration: 250,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  });
}

function getOrigin(element?: HTMLElement | null): { x: number; y: number } {
  if (!element) return { x: 0.5, y: 0.9 };
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left + rect.width / 2) / window.innerWidth,
    y: (rect.top + rect.height / 2) / window.innerHeight,
  };
}

/**
 * Returns a function that fires a celebration animation.
 * Pass an HTMLElement to anchor the burst origin to that element,
 * otherwise it bursts from the bottom-center of the viewport.
 *
 * Variant controls the style:
 * - 'ascent' (default): multi-colour celebratory confetti burst
 * - 'attempt': red-only confetti, shorter range
 * - 'flash': lightning bolt shapes radiate from the origin element
 */
export function useConfetti() {
  const fireConfetti = useCallback((originElement?: HTMLElement | null, variant: ConfettiVariant = 'ascent') => {
    if (variant === 'flash') {
      if (originElement) fireThunderstrike(originElement);
      return;
    }

    const isAttempt = variant === 'attempt';
    void confetti({
      particleCount: 35,
      spread: isAttempt ? 40 : 60,
      startVelocity: isAttempt ? 12 : 25,
      decay: 0.92,
      scalar: 0.8,
      ticks: 60,
      origin: getOrigin(originElement),
      gravity: 0.8,
      disableForReducedMotion: true,
      // Must be above MUI drawer z-index (1300) so confetti is visible
      // when fired from inside a SwipeableDrawer portal.
      zIndex: 1400,
      ...(isAttempt && { colors: ['#d32f2f', '#b71c1c', '#e53935'] }),
    });
  }, []);

  return fireConfetti;
}
