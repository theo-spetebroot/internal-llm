import { Link } from 'react-router';

import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/layout/PageHeader';

/** "Not found" message, also used for a conversation that does not exist for this user. */
export function NotFoundContent() {
  return (
    <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-center gap-5 px-6 py-16 md:px-8">
      <title>Page introuvable · internal-llm</title>
      <h1 className="font-serif text-4xl font-normal italic">Page introuvable.</h1>
      <p className="font-serif text-lg text-ink-2">Cette adresse ne mène nulle part.</p>
      <Link to="/" className={buttonVariants({ variant: 'outline', className: 'self-start' })}>
        Retour à l’accueil
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <>
      <PageHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NotFoundContent />
      </div>
    </>
  );
}
