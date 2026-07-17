import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import BoardForm from '../board-form';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('../map-location-picker', () => ({
  default: ({
    onChange,
  }: {
    latitude: number | null;
    longitude: number | null;
    onChange: (lat: number, lng: number) => void;
  }) => (
    <div data-testid="map-location-picker">
      <button type="button" data-testid="map-select-location" onClick={() => onChange(51.5074, -0.1278)}>
        Select Location
      </button>
    </div>
  ),
}));

const defaultValues = {
  name: 'Test Board',
  description: 'A test board',
  locationName: 'Test Gym',
  isPublic: true,
  isUnlisted: false,
  hideLocation: false,
  isOwned: true,
  angle: 40,
  isAngleAdjustable: true,
  serialNumber: '',
};

describe('BoardForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('renders all form fields', () => {
    render(<BoardForm title="Edit Board" submitLabel="Save" initialValues={defaultValues} onSubmit={mockOnSubmit} />);

    expect(screen.getByLabelText('Board Name *')).toBeDefined();
    expect(screen.getByLabelText('Description')).toBeDefined();
    expect(screen.getByLabelText('Location name')).toBeDefined();
    expect(screen.getByLabelText('Controller Serial Number')).toBeDefined();
    expect(screen.getByText('Edit Board')).toBeDefined();
    expect(screen.getByText('Save')).toBeDefined();
  });

  it('renders serial number field with initial value', () => {
    render(
      <BoardForm
        title="Edit Board"
        submitLabel="Save"
        initialValues={{ ...defaultValues, serialNumber: 'SN-12345' }}
        onSubmit={mockOnSubmit}
      />,
    );

    const serialField = screen.getByLabelText('Controller Serial Number') as HTMLInputElement;
    expect(serialField.value).toBe('SN-12345');
  });

  it('allows editing the serial number field', () => {
    render(<BoardForm title="Edit Board" submitLabel="Save" initialValues={defaultValues} onSubmit={mockOnSubmit} />);

    const serialField = screen.getByLabelText('Controller Serial Number') as HTMLInputElement;
    fireEvent.change(serialField, { target: { value: 'NEW-SERIAL' } });
    expect(serialField.value).toBe('NEW-SERIAL');
  });

  it('submits form with serial number value', async () => {
    render(
      <BoardForm
        title="Edit Board"
        submitLabel="Save"
        initialValues={{ ...defaultValues, serialNumber: 'SN-99' }}
        onSubmit={mockOnSubmit}
      />,
    );

    fireEvent.submit(screen.getByText('Save').closest('form')!);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Board',
          serialNumber: 'SN-99',
        }),
      );
    });
  });

  it('submits undefined serialNumber when field is empty', async () => {
    render(<BoardForm title="Edit Board" submitLabel="Save" initialValues={defaultValues} onSubmit={mockOnSubmit} />);

    fireEvent.submit(screen.getByText('Save').closest('form')!);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          serialNumber: undefined,
        }),
      );
    });
  });

  it('renders cancel button when onCancel is provided', () => {
    render(
      <BoardForm
        title="Edit Board"
        submitLabel="Save"
        initialValues={defaultValues}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );

    const cancelButton = screen.getByText('Cancel');
    expect(cancelButton).toBeDefined();
    fireEvent.click(cancelButton);
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('renders angle selector when availableAngles provided', () => {
    render(
      <BoardForm
        title="Edit Board"
        submitLabel="Save"
        initialValues={defaultValues}
        availableAngles={[20, 30, 40, 50]}
        onSubmit={mockOnSubmit}
      />,
    );

    expect(screen.getByLabelText('Default Angle')).toBeDefined();
  });

  it('renders slug field when showSlugField is true', () => {
    render(
      <BoardForm
        title="Edit Board"
        submitLabel="Save"
        initialValues={{ ...defaultValues, slug: 'my-board' }}
        showSlugField
        onSubmit={mockOnSubmit}
      />,
    );

    expect(screen.getByLabelText('URL Slug')).toBeDefined();
  });

  it('renders map location picker', () => {
    render(<BoardForm title="Edit Board" submitLabel="Save" initialValues={defaultValues} onSubmit={mockOnSubmit} />);

    expect(screen.getByTestId('map-location-picker')).toBeDefined();
  });

  it('submits form with updated location from map picker', async () => {
    render(<BoardForm title="Edit Board" submitLabel="Save" initialValues={defaultValues} onSubmit={mockOnSubmit} />);

    fireEvent.click(screen.getByTestId('map-select-location'));
    fireEvent.submit(screen.getByText('Save').closest('form')!);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 51.5074,
          longitude: -0.1278,
        }),
      );
    });
  });

  it('disables submit button when name is empty', () => {
    render(
      <BoardForm
        title="Edit Board"
        submitLabel="Save"
        initialValues={{ ...defaultValues, name: '' }}
        onSubmit={mockOnSubmit}
      />,
    );

    const submitButton = screen.getByText('Save');
    expect(submitButton.closest('button')?.disabled).toBe(true);
  });
});
