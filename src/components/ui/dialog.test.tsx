import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

function ExampleDialog({ overlayClassName }: { overlayClassName?: string }) {
  return (
    <Dialog open>
      <DialogContent overlayClassName={overlayClassName} className="z-[101]">
        <DialogTitle>Test dialog</DialogTitle>
        <DialogDescription>Test description</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

describe('DialogContent', () => {
  it('keeps the default overlay layering when no override is provided', () => {
    render(<ExampleDialog />);

    const content = screen.getByRole('dialog');
    expect(content).toHaveClass('z-[101]');
    expect(content.previousElementSibling).toHaveClass('z-50');
  });

  it('forwards an optional overlay class without changing the content contract', () => {
    render(<ExampleDialog overlayClassName="z-[100]" />);

    const content = screen.getByRole('dialog');
    expect(content).toHaveClass('z-[101]');
    expect(content.previousElementSibling).toHaveClass('z-[100]');
  });
});
