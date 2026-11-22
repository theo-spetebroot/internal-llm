import { useCurrentUser } from '@/auth/current-user';
import { PageHeader } from '@/layout/PageHeader';

/** Landing screen once logged in; the new conversation composer lands here. */
export function HomePage() {
  const user = useCurrentUser();
  const firstName = user.displayName.split(/\s+/)[0] ?? user.displayName;

  return (
    <>
      <title>internal-llm</title>
      <PageHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-center gap-5 px-6 py-16 md:px-8">
          <div aria-hidden="true" className="h-0.5 w-10 bg-accent" />
          <h1 className="font-serif text-4xl leading-tight font-normal tracking-[-0.02em] italic md:text-5xl">
            Bonjour, {firstName}.
          </h1>
          <p className="max-w-md font-serif text-lg leading-relaxed text-ink-2">
            Vos conversations avec le modèle apparaîtront ici.
          </p>
        </div>
      </div>
    </>
  );
}
