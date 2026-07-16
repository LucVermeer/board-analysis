import { describe, it, expect, vi } from 'vite-plus/test';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { FormSwitchRow } from '../form-switch-row';

describe('FormSwitchRow', () => {
  it('toggles when the row (label text) is clicked', () => {
    const onChange = vi.fn();
    render(<FormSwitchRow label="Make public" checked={false} onChange={onChange} />);
    // Clicking the label text bubbles to the wrapping <label>, activating the switch.
    fireEvent.click(screen.getByText('Make public'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('wires the description to the switch via aria-describedby', () => {
    const { container } = render(
      <FormSwitchRow label="Make public" description="Anyone can view this board" checked={false} onChange={vi.fn()} />,
    );
    const input = container.querySelector('input[type="checkbox"]');
    const describedBy = input?.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const descriptionEl = document.getElementById(describedBy as string);
    expect(descriptionEl?.textContent).toContain('Anyone can view this board');
  });

  it('reflects the checked state on the input', () => {
    const { container } = render(<FormSwitchRow label="On" checked onChange={vi.fn()} />);
    const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.checked).toBe(true);
  });
});
