import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type Column } from '../DataTable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

interface TestItem {
  id: string;
  name: string;
  price: number;
}

const testColumns: Column<TestItem>[] = [
  { key: 'name', header: 'Name', render: (item) => item.name },
  {
    key: 'price',
    header: 'Price',
    render: (item) => `$${item.price}`,
  },
];

const testData: TestItem[] = [
  { id: '1', name: 'Oil Change', price: 30 },
  { id: '2', name: 'Car Wash', price: 15 },
  { id: '3', name: 'Tire Rotation', price: 50 },
];

describe('DataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeletons when loading is true', () => {
    render(<DataTable columns={testColumns} data={[]} loading={true} />);

    // Loading container should be rendered, data rows should not
    expect(screen.getByTestId('datatable-loading')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders empty message when data is empty and not loading', () => {
    render(<DataTable columns={testColumns} data={[]} />);

    expect(screen.getByText('status.noResults')).toBeInTheDocument();
  });

  it('renders custom empty message', () => {
    render(
      <DataTable
        columns={testColumns}
        data={[]}
        emptyMessage="No orders found"
      />,
    );

    expect(screen.getByText('No orders found')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    render(<DataTable columns={testColumns} data={testData} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Price')).toBeInTheDocument();
  });

  it('renders data rows correctly', () => {
    render(<DataTable columns={testColumns} data={testData} />);

    expect(screen.getByText('Oil Change')).toBeInTheDocument();
    expect(screen.getByText('$30')).toBeInTheDocument();
    expect(screen.getByText('Car Wash')).toBeInTheDocument();
    expect(screen.getByText('$15')).toBeInTheDocument();
  });

  it('calls onRowClick when a row is clicked', async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();

    render(
      <DataTable
        columns={testColumns}
        data={testData}
        onRowClick={onRowClick}
      />,
    );

    await user.click(screen.getByText('Oil Change'));
    expect(onRowClick).toHaveBeenCalledWith(testData[0]);
  });

  it('does not render pagination when totalPages is 1', () => {
    render(
      <DataTable
        columns={testColumns}
        data={testData}
        page={1}
        totalPages={1}
        total={3}
        onPageChange={vi.fn()}
      />,
    );

    // No pagination buttons should be rendered
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders pagination when totalPages > 1', () => {
    const onPageChange = vi.fn();

    render(
      <DataTable
        columns={testColumns}
        data={testData}
        page={1}
        totalPages={5}
        total={50}
        onPageChange={onPageChange}
      />,
    );

    // Pagination showing text
    expect(screen.getByText(/pagination.showing/)).toBeInTheDocument();
  });

  it('calls onPageChange when next page button is clicked', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();

    render(
      <DataTable
        columns={testColumns}
        data={testData}
        page={1}
        totalPages={5}
        total={50}
        onPageChange={onPageChange}
      />,
    );

    const nextPageBtn = screen.getByRole('button', { name: /next page/i });
    await user.click(nextPageBtn);

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables previous buttons on first page', () => {
    render(
      <DataTable
        columns={testColumns}
        data={testData}
        page={1}
        totalPages={5}
        total={50}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /first page/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /previous page/i }),
    ).toBeDisabled();
  });

  it('disables next buttons on last page', () => {
    render(
      <DataTable
        columns={testColumns}
        data={testData}
        page={5}
        totalPages={5}
        total={50}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /last page/i })).toBeDisabled();
  });

  it('renders page size selector when onLimitChange is provided', () => {
    render(
      <DataTable
        columns={testColumns}
        data={testData}
        page={1}
        totalPages={2}
        total={30}
        limit={10}
        onPageChange={vi.fn()}
        onLimitChange={vi.fn()}
      />,
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    // Check available options
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      '10 pagination.perPage',
      '20 pagination.perPage',
      '50 pagination.perPage',
      '100 pagination.perPage',
    ]);
  });

  it('calls onLimitChange when page size is changed', async () => {
    const onLimitChange = vi.fn();
    const user = userEvent.setup();

    render(
      <DataTable
        columns={testColumns}
        data={testData}
        page={1}
        totalPages={2}
        total={30}
        limit={10}
        onPageChange={vi.fn()}
        onLimitChange={onLimitChange}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), '50');
    expect(onLimitChange).toHaveBeenCalledWith(50);
  });

  it('uses getRowKey when provided', () => {
    const customKey = vi.fn((item: TestItem) => `custom-${item.id}`);

    render(
      <DataTable columns={testColumns} data={testData} getRowKey={customKey} />,
    );

    expect(customKey).toHaveBeenCalledTimes(3);
  });

  it('shows correct "showing X to Y of Z" text', () => {
    render(
      <DataTable
        columns={testColumns}
        data={testData}
        page={2}
        totalPages={3}
        total={25}
        limit={10}
        onPageChange={vi.fn()}
      />,
    );

    // Page 2 with limit 10: showing 11 to 20 of 25
    expect(screen.getByText(/11/)).toBeInTheDocument();
    expect(screen.getByText(/20/)).toBeInTheDocument();
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });
});
