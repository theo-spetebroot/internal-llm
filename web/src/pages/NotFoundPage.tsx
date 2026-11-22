import { Link } from 'react-router';

import { buttonVariants } from '@/components/ui/button';

export function NotFoundPage() {
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
