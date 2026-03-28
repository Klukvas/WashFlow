import { useState } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/shared/ui/dialog';
import { useCreateSupportRequest } from '../hooks/useSupport';

export function SupportButton() {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const { mutate, isPending } = useCreateSupportRequest();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate(
      { subject: subject.trim(), message: message.trim() },
      {
        onSuccess: () => {
          setOpen(false);
          setSubject('');
          setMessage('');
        },
      },
    );
  };

  const isValid = subject.trim().length > 0 && message.trim().length > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label={t('support.title')}
      >
        <MessageCircleQuestion className="h-6 w-6" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>{t('support.title')}</DialogTitle>
        </DialogHeader>

        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t('support.subject')}
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('support.subjectPlaceholder')}
                maxLength={200}
                disabled={isPending}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                {t('support.message')}
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('support.messagePlaceholder')}
                maxLength={2000}
                rows={5}
                disabled={isPending}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                {t('actions.cancel')}
              </Button>
              <Button type="submit" loading={isPending} disabled={!isValid}>
                {t('actions.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
