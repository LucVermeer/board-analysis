import { describe, it, expect, vi } from 'vite-plus/test';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import BoardInstallQr from '../board-install-qr';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
}));

// Capture the QRCodeSVG `value` so we can assert the encoded deep-link target
// without decoding the rendered matrix.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr" data-value={value} />,
}));

describe('BoardInstallQr', () => {
  it('encodes /b/{slug} against the canonical site URL', () => {
    render(<BoardInstallQr slug="main-kilter" />);
    expect(screen.getByTestId('qr').getAttribute('data-value')).toBe('https://www.boardsesh.com/b/main-kilter');
  });

  it('renders the install caption from the kiosk catalog', () => {
    render(<BoardInstallQr slug="main-kilter" />);
    expect(screen.getByText(tFromCatalog('kiosk', 'installQr.caption') as string)).toBeTruthy();
  });
});
