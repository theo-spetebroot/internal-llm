import { CircleAlert } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';

import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { safeRedirect } from './safe-redirect';
import { InvalidCredentialsError, loginFormSchema, useLogin, useSession } from './session';

interface FieldErrors {
  email?: string | undefined;
  password?: string | undefined;
}

export function LoginPage() {
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const id = useId();

  const target = safeRedirect(searchParams.get('redirect'));

  if (session.data) return <Navigate to={target} replace />;

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = loginFormSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      const { fieldErrors: errors } = z.flattenError(parsed.error);
      setFieldErrors({ email: errors.email?.[0], password: errors.password?.[0] });
      return;
    }
    setFieldErrors({});
    login.mutate(parsed.data, {
      onSuccess: () => {
        void navigate(target, { replace: true });
      },
    });
  };

  let formError: string | undefined;
  if (login.error instanceof InvalidCredentialsError) {
    formError = 'Adresse e-mail ou mot de passe incorrect.';
  } else if (login.error) {
    formError = 'Connexion impossible : le serveur ne répond pas. Réessayez dans un instant.';
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper md:flex-row">
      <title>Connexion · internal-llm</title>

      <section className="flex flex-col gap-5 border-b border-rule bg-sidebar px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-9 md:min-h-dvh md:flex-1 md:justify-between md:border-r md:border-b-0 md:px-12 md:py-14 lg:px-18">
        <Brand className="md:text-[26px]" />
        <div className="flex max-w-xl flex-col gap-5 md:gap-7">
          <div aria-hidden="true" className="mt-7 h-0.5 w-10 bg-accent md:mt-0 md:w-14" />
          <h1 className="font-serif text-[46px] leading-[1.04] font-normal tracking-[-0.02em] italic md:text-6xl lg:text-[76px] lg:leading-[1.02] lg:tracking-[-0.025em]">
            Votre modèle,
            <br />
            chez vous.
          </h1>
          <p className="max-w-md font-serif text-[17px] leading-normal text-ink-2 md:text-xl">
            <span className="hidden md:inline">
              Une interface de conversation pour un modèle de langage auto-hébergé.{' '}
            </span>
            Les échanges ne quittent jamais votre serveur.
          </p>
        </div>
        <p className="hidden gap-6 font-mono text-xs font-medium text-ink-3 md:flex">
          <span>Instance privée</span>
          <span aria-hidden="true">·</span>
          <span>Accès sur invitation</span>
        </p>
      </section>

      <section className="flex flex-1 justify-center px-6 pt-8 pb-[max(1.75rem,env(safe-area-inset-bottom))] md:items-center md:px-8 md:py-14">
        <form
          noValidate
          onSubmit={onSubmit}
          className="flex w-full max-w-[380px] flex-col gap-5 md:gap-6"
        >
          <div className="flex flex-col gap-2">
            <h2 className="font-serif text-[28px] leading-tight font-medium tracking-[-0.01em] md:text-[34px]">
              Connexion
            </h2>
            <p className="text-[15px] text-ink-2">
              Les comptes sont créés par l’administrateur de l’instance.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-email`}>Adresse e-mail</Label>
            <Input
              id={`${id}-email`}
              name="email"
              type="email"
              autoComplete="username"
              placeholder="vous@exemple.fr"
              required
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? `${id}-email-error` : undefined}
            />
            {fieldErrors.email && (
              <p id={`${id}-email-error`} className="text-[13px] text-danger-ink">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-password`}>Mot de passe</Label>
            <Input
              id={`${id}-password`}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? `${id}-password-error` : undefined}
            />
            {fieldErrors.password && (
              <p id={`${id}-password-error`} className="text-[13px] text-danger-ink">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <Button type="submit" size="lg" className="mt-1" disabled={login.isPending}>
            {login.isPending ? 'Connexion…' : 'Se connecter'}
          </Button>

          {formError && (
            <p
              role="alert"
              className="flex items-start gap-2.5 rounded-[10px] bg-danger-bg px-3.5 py-3 text-sm leading-snug text-danger-ink"
            >
              <CircleAlert
                className="mt-px size-[18px] shrink-0"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span>{formError}</span>
            </p>
          )}

          <p className="mt-auto text-center font-mono text-xs font-medium text-ink-3 md:hidden">
            Instance privée · Accès sur invitation
          </p>
        </form>
      </section>
    </div>
  );
}
