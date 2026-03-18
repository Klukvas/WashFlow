import { useNavigate } from 'react-router';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/shared/ui/button';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <FileQuestion className="mb-4 h-16 w-16 text-muted-foreground" />
      <h1 className="mb-2 text-2xl font-bold">404 — Page Not Found</h1>
      <p className="mb-6 text-muted-foreground">
        The page you're looking for doesn't exist.
      </p>
      <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
    </div>
  );
}
