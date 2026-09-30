'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Student } from '@study/contracts';
import { api, errorMessage } from '../../lib/api';

type AuthMode = 'login' | 'register' | 'reset';

function authTitle(mode: AuthMode) {
  if (mode === 'register') {
    return 'Criar sua conta';
  }
  if (mode === 'reset') {
    return 'Recuperar acesso';
  }
  return 'Entrar no caderno';
}

function AuthLinks({ mode }: { mode: AuthMode }) {
  return (
    <nav className="auth-links" aria-label="Acesso à conta">
      {mode !== 'login' && <Link href="/entrar">Já tenho uma conta</Link>}
      {mode !== 'register' && <Link href="/cadastro">Criar conta</Link>}
      {mode !== 'reset' && (
        <Link href="/recuperar-senha">Esqueci minha senha</Link>
      )}
    </nav>
  );
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [returnTo, setReturnTo] = useState('/conversas');
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setResetToken(params.get('token') ?? '');
    setSessionExpired(params.get('expired') === '1');
    const requested = params.get('returnTo');
    if (requested?.startsWith('/') && !requested.startsWith('//')) {
      setReturnTo(requested);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setPending(true);
    try {
      if (mode === 'reset') {
        if (resetToken) {
          await api<void>('/auth/password-reset/confirm', {
            method: 'POST',
            body: { token: resetToken, newPassword: password },
          });
          setSuccess('Senha alterada. Entre com a nova senha.');
        } else {
          await api<void>('/auth/password-reset', {
            method: 'POST',
            body: { email },
          });
          setSuccess(
            'Se o e-mail estiver cadastrado, você receberá um link para definir outra senha.',
          );
        }
      } else {
        await api<Student>(
          mode === 'register' ? '/auth/register' : '/auth/login',
          {
            method: 'POST',
            body: { email, password },
          },
        );
        router.replace(returnTo);
        router.refresh();
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-wrap">
      <section className="auth-intro" aria-label="Sobre o Caderno">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            ◧
          </span>
          Caderno
        </Link>
        <div>
          <span className="eyebrow">Professor de IA · Prática formativa</span>
          <h1>Um lugar para entender melhor.</h1>
          <p>
            Pergunte, explore um assunto no seu ritmo e retome seu estudo de
            onde parou.
          </p>
        </div>
        <p className="hint">Suas conversas ficam na sua conta.</p>
      </section>
      <main className="auth-panel">
        <span className="eyebrow">Seu espaço de estudo</span>
        <h2>{authTitle(mode)}</h2>
        <p className="subtle">
          {mode === 'reset'
            ? resetToken
              ? 'Defina uma nova senha para sua conta.'
              : 'Informe seu e-mail para receber as instruções.'
            : 'Comece uma conversa com seu professor de IA.'}
        </p>
        {mode === 'login' && sessionExpired && (
          <p className="form-error" role="alert">
            Sua sessão terminou. Entre novamente para continuar.
          </p>
        )}
        <form onSubmit={(event) => void submit(event)}>
          {!(mode === 'reset' && resetToken) && (
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={320}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          )}
          {(mode !== 'reset' || resetToken) && (
            <div className="field">
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === 'register' || resetToken
                    ? 'new-password'
                    : 'current-password'
                }
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {(mode === 'register' || resetToken) && (
                <span className="hint">Use de 12 a 128 caracteres.</span>
              )}
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="form-success" role="status">
              {success}
            </p>
          )}
          <button className="button" type="submit" disabled={pending}>
            {pending
              ? 'Aguarde…'
              : mode === 'register'
                ? 'Criar conta'
                : mode === 'reset'
                  ? resetToken
                    ? 'Alterar senha'
                    : 'Enviar instruções'
                  : 'Entrar'}
          </button>
        </form>
        <AuthLinks mode={mode} />
      </main>
    </div>
  );
}
