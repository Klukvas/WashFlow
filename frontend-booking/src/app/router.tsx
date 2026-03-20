import { createBrowserRouter } from 'react-router';
import { BookingLayout } from '@/layout/BookingLayout';
import { BookingPage } from '@/pages/BookingPage';

export const router = createBrowserRouter([
  {
    element: <BookingLayout />,
    children: [
      { index: true, element: <BookingPage /> },
    ],
  },
]);
