import { useNavigate } from 'react-router';
import { ShieldX } from 'lucide-react';
import { Button } from '@/shared/ui/button';

export function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <ShieldX className="mb-4 h-16 w-16 text-destructive" />
      <h1 className="mb-2 text-2xl font-bold">403 — Access Denied</h1>
      <p className="mb-6 text-muted-foreground">
        You don't have permission to access this page.
      </p>
      <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
    </div>
  );
}
