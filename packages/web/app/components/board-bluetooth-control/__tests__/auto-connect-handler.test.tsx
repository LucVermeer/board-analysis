import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, act } from '@testing-library/react';
import React from 'react';
import { AutoConnectHandler } from '../auto-connect-handler';

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();
const mockPathname = '/kilter/1/10/1,2/40';

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}));

const mockSetCurrentClimb = vi.fn();
let mockSearchData = {
  climbSearchResults: [
    { uuid: 'climb-1', frames: 'p1r12p2r13', mirrored: false },
    { uuid: 'climb-2', frames: 'p3r14', mirrored: true },
  ] as Array<{ uuid: string; frames: string; mirrored: boolean }> | null,
  hasDoneFirstFetch: true,
};

vi.mock('../../graphql-queue', () => ({
  useSearchData: () => mockSearchData,
  useQueueActions: () => ({ setCurrentClimb: mockSetCurrentClimb }),
}));

type ConnectFn = (initialFrames?: string, mirrored?: boolean, targetSerial?: string) => Promise<boolean>;

describe('AutoConnectHandler', () => {
  let mockConnect: ReturnType<typeof vi.fn<ConnectFn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect = vi.fn<ConnectFn>().mockResolvedValue(true);
    mockSearchParams = new URLSearchParams();
    mockSearchData = {
      climbSearchResults: [
        { uuid: 'climb-1', frames: 'p1r12p2r13', mirrored: false },
        { uuid: 'climb-2', frames: 'p3r14', mirrored: true },
      ],
      hasDoneFirstFetch: true,
    };
  });

  it('renders nothing (returns null)', () => {
    const { container } = render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);
    expect(container.innerHTML).toBe('');
  });

  it('does not trigger when autoConnect param is absent', async () => {
    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockSetCurrentClimb).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('auto-connects with serial, selects first climb, and removes URL param', async () => {
    mockSearchParams = new URLSearchParams('autoConnect=751737');

    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalledTimes(1);
      });
    });

    // Should select the first search result
    expect(mockSetCurrentClimb).toHaveBeenCalledWith(mockSearchData.climbSearchResults![0], {
      clearPlaylistSuggestionSource: true,
    });

    // Should call connect with the first climb's frames, mirrored flag, and the serial
    expect(mockConnect).toHaveBeenCalledWith('p1r12p2r13', false, '751737');

    // Should remove autoConnect from URL
    expect(mockReplace).toHaveBeenCalledWith(mockPathname);
  });

  it('preserves other URL params when removing autoConnect', async () => {
    mockSearchParams = new URLSearchParams('autoConnect=751737&sort=popular');

    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await vi.waitFor(() => {
        expect(mockReplace).toHaveBeenCalledTimes(1);
      });
    });

    expect(mockReplace).toHaveBeenCalledWith(`${mockPathname}?sort=popular`);
  });

  it('does not trigger when hasDoneFirstFetch is false', async () => {
    mockSearchParams = new URLSearchParams('autoConnect=751737');
    mockSearchData = { ...mockSearchData, hasDoneFirstFetch: false };

    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('does not trigger when climbSearchResults is null', async () => {
    mockSearchParams = new URLSearchParams('autoConnect=751737');
    mockSearchData = { ...mockSearchData, climbSearchResults: null };

    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('does not trigger when climbSearchResults is empty', async () => {
    mockSearchParams = new URLSearchParams('autoConnect=751737');
    mockSearchData = { ...mockSearchData, climbSearchResults: [] };

    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('does not trigger when isBluetoothSupported is false', async () => {
    mockSearchParams = new URLSearchParams('autoConnect=751737');

    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported={false} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('does not trigger twice on re-render (triggeredRef guard)', async () => {
    mockSearchParams = new URLSearchParams('autoConnect=751737');

    const { rerender } = render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalledTimes(1);
      });
    });

    // Re-render with same props — should not trigger again
    rerender(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('rejects non-alphanumeric serial numbers', async () => {
    mockSearchParams = new URLSearchParams('autoConnect=abc<script>alert(1)</script>');

    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('accepts hyphenated serial numbers (e.g. KB-99 from the mismatch-switch flow)', async () => {
    mockSearchParams = new URLSearchParams('autoConnect=KB-99');

    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledWith('p1r12p2r13', false, 'KB-99');
  });

  it('rejects serial numbers with disallowed special characters', async () => {
    // Slashes/spaces/other punctuation are still rejected — only [A-Za-z0-9-] is allowed.
    mockSearchParams = new URLSearchParams('autoConnect=abc/123');

    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('rejects serial numbers longer than 64 characters', async () => {
    mockSearchParams = new URLSearchParams(`autoConnect=${'A'.repeat(65)}`);

    render(<AutoConnectHandler connect={mockConnect} isBluetoothSupported />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConnect).not.toHaveBeenCalled();
  });
});
