import { describe, it, expect } from 'vite-plus/test';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { FormSection } from '../form-section';

describe('FormSection', () => {
  it('renders the title and description above the fields', () => {
    render(
      <FormSection title="Location" description="Where the board lives">
        <div>field</div>
      </FormSection>,
    );
    expect(screen.getByText('Location')).toBeTruthy();
    expect(screen.getByText('Where the board lives')).toBeTruthy();
    expect(screen.getByText('field')).toBeTruthy();
  });

  it('renders a title without a description (and vice versa)', () => {
    const { rerender } = render(
      <FormSection title="Setup">
        <div>field</div>
      </FormSection>,
    );
    expect(screen.getByText('Setup')).toBeTruthy();

    rerender(
      <FormSection description="Only supporting copy">
        <div>field</div>
      </FormSection>,
    );
    expect(screen.queryByText('Setup')).toBeNull();
    expect(screen.getByText('Only supporting copy')).toBeTruthy();
  });

  it('omits the header block entirely when neither title nor description is given', () => {
    const { container } = render(
      <FormSection>
        <div>only field</div>
      </FormSection>,
    );
    // Root box should contain exactly one child: the fields column (no empty
    // header box reserving its 12px gap).
    const rootBox = container.firstElementChild as HTMLElement;
    expect(rootBox.children.length).toBe(1);
    expect(screen.getByText('only field')).toBeTruthy();
  });

  it('stacks children inside a single fields column', () => {
    const { container } = render(
      <FormSection title="Details">
        <div>first</div>
        <div>second</div>
      </FormSection>,
    );
    const rootBox = container.firstElementChild as HTMLElement;
    // Header block + fields column.
    expect(rootBox.children.length).toBe(2);
    const fieldsColumn = rootBox.children[1] as HTMLElement;
    expect(fieldsColumn.children.length).toBe(2);
  });
});
