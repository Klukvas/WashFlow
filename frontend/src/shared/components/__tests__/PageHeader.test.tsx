import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('renders the title as an h1 element', () => {
    render(<PageHeader title="Test Title" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Test Title');
  });

  it('does not render a description paragraph when description is not provided', () => {
    const { container } = render(<PageHeader title="Title Only" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(0);
  });

  it('renders the description when provided', () => {
    render(<PageHeader title="Title" description="Some description text" />);
    expect(screen.getByText('Some description text')).toBeInTheDocument();
  });

  it('renders the description inside a paragraph element', () => {
    const { container } = render(
      <PageHeader title="Title" description="A description" />,
    );
    const paragraph = container.querySelector('p');
    expect(paragraph).not.toBeNull();
    expect(paragraph).toHaveTextContent('A description');
  });

  it('does not render the actions container when actions is not provided', () => {
    const { container } = render(<PageHeader title="Title" />);
    const actionsDiv = container.querySelector('.flex.items-center.gap-3');
    expect(actionsDiv).toBeNull();
  });

  it('renders actions when provided', () => {
    render(
      <PageHeader
        title="Title"
        actions={<button>Create</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('renders multiple action elements', () => {
    render(
      <PageHeader
        title="Title"
        actions={
          <>
            <button>Action 1</button>
            <button>Action 2</button>
          </>
        }
      />,
    );
    expect(screen.getByRole('button', { name: 'Action 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action 2' })).toBeInTheDocument();
  });

  it('renders all props together', () => {
    render(
      <PageHeader
        title="Full Header"
        description="Full description"
        actions={<button>Full Action</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Full Header');
    expect(screen.getByText('Full description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full Action' })).toBeInTheDocument();
  });

  it('applies the correct heading styling classes', () => {
    render(<PageHeader title="Styled Title" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).toContain('text-2xl');
    expect(heading.className).toContain('font-bold');
    expect(heading.className).toContain('tracking-tight');
  });
});
