import { describe, it, expect } from 'vite-plus/test';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { FormRow } from '../form-row';

describe('FormRow', () => {
  it('renders each child', () => {
    render(
      <FormRow>
        <div data-testid="first">A</div>
        <div data-testid="second">B</div>
      </FormRow>,
    );
    expect(screen.getByTestId('first')).toBeTruthy();
    expect(screen.getByTestId('second')).toBeTruthy();
  });

  it('applies the grid sx (single column base + N-column container query)', () => {
    // Container queries don't evaluate in JSDOM, so assert the emitted CSS instead: a
    // single-column base with a container-query bump to one column per child.
    render(
      <FormRow>
        <div>A</div>
        <div>B</div>
      </FormRow>,
    );
    const styleText = Array.from(document.querySelectorAll('style'))
      .map((styleEl) => styleEl.textContent ?? '')
      .join('');
    expect(styleText).toMatch(/grid-template-columns:\s*1fr/);
    expect(styleText).toMatch(/@container[^{]*min-width:\s*440px/);
    expect(styleText).toMatch(/repeat\(2,\s*1fr\)/);
  });

  it('ignores conditionally-omitted (null) children when sizing the grid', () => {
    // A `{condition && <Field/>}` slot that resolves to null must not leave a
    // ghost column — the remaining child should get the full row.
    render(
      <FormRow>
        {null}
        <div>Only child</div>
      </FormRow>,
    );
    // Scope to this container's own emotion class — the shared jsdom style
    // registry still holds rules from other tests in this file.
    const gridClass = screen
      .getByText('Only child')
      .parentElement?.className.split(' ')
      .find((cls) => cls.startsWith('css-'));
    expect(gridClass).toBeTruthy();
    const ruleText = Array.from(document.querySelectorAll('style'))
      .map((styleEl) => styleEl.textContent ?? '')
      .join('')
      .split(`.${gridClass}`)
      .slice(1)
      .join(' ');
    expect(ruleText).toMatch(/repeat\(1,\s*1fr\)/);
    expect(ruleText).not.toMatch(/repeat\(2,\s*1fr\)/);
  });

  it('puts the children in a grid container with an sx-generated class', () => {
    render(
      <FormRow>
        <div data-testid="cell">A</div>
      </FormRow>,
    );
    const gridContainer = screen.getByTestId('cell').parentElement;
    expect(gridContainer?.className).toBeTruthy();
  });
});
