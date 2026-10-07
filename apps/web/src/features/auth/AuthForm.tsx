'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Layers,
  LoaderCircle,
  MessageCircle,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import type { Student } from '@study/contracts';
import { api, errorMessage } from '../../lib/api';
import { safeReturnTo } from '../../lib/safe-return-to';

type AuthMode = 'login' | 'register' | 'reset';
const authIntroduction = {
  login: 'Bem-vindo de volta',
  register: 'Um novo começo',
  reset: 'Vamos recuperar seu acesso',
};

function authTitle(mode: AuthMode) {
  if (mode === 'register') {
    return 'Criar sua conta';
  }
  if (mode === 'reset') {
    return 'Recuperar acesso';
  }
  return 'Entrar no Caderno';
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setResetToken(params.get('token') ?? '');
    setSessionExpired(params.get('expired') === '1');
    setReturnTo(safeReturnTo(params.get('returnTo'), window.location.origin));
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
    <div className="auth-wrap studio-auth">
      <section className="auth-intro" aria-label="Sobre o Caderno">
        <Link className="brand" href="/">
          <span className="brand-symbol">
            <BookOpen size={23} strokeWidth={1.6} aria-hidden="true" />
          </span>
          Caderno
        </Link>
        <BlurFade
          className="auth-editorial"
          delay={0.08}
          offset={14}
          blur="4px"
        >
          <Badge variant="outline" className="auth-intro-badge">
            <Sparkles size={13} aria-hidden="true" /> Seu estúdio de estudo
          </Badge>
          <h1>
            O próximo
            <br />
            passo começa
            <br />
            com <em>uma pergunta.</em>
          </h1>
          <p>
            Dê espaço à sua curiosidade. Converse com seu professor de IA,
            pratique o que aprendeu e veja suas ideias crescerem.
          </p>
          <motion.div
            className="auth-study-preview"
            initial={reduceMotion ? false : { opacity: 0, y: 20, rotate: -3 }}
            animate={{ opacity: 1, y: 0, rotate: -2 }}
            transition={{ duration: reduceMotion ? 0 : 0.7, delay: 0.25 }}
          >
            <div className="preview-heading">
              <span>
                <BookOpen size={15} aria-hidden="true" /> Uma página do seu
                caderno
              </span>
              <span className="preview-dot" />
            </div>
            <p className="preview-question">“E se eu entendesse o porquê?”</p>
            <div className="preview-answer">
              <span className="preview-ai">
                <Sparkles size={15} aria-hidden="true" />
              </span>
              <div>
                <strong>Vamos explorar juntos.</strong>
                <p>Um conceito, um exemplo e uma nova descoberta.</p>
              </div>
            </div>
            <div className="preview-bottom">
              <Check size={14} aria-hidden="true" /> Aprender no seu ritmo{' '}
              <ArrowRight size={15} aria-hidden="true" />
            </div>
          </motion.div>
        </BlurFade>
        <div className="auth-capabilities">
          <span>
            <MessageCircle size={16} aria-hidden="true" /> Converse
          </span>
          <span>
            <Layers size={16} aria-hidden="true" /> Pratique
          </span>
          <span>
            <TrendingUp size={16} aria-hidden="true" /> Evolua
          </span>
        </div>
      </section>
      <main className="auth-panel">
        <BlurFade className="auth-form-wrap" delay={0.14} offset={12}>
          <span className="auth-section-index">{authIntroduction[mode]}</span>
          <h2>{authTitle(mode)}</h2>
          <p className="subtle">
            {mode === 'reset'
              ? resetToken
                ? 'Defina uma nova senha para sua conta.'
                : 'Informe seu e-mail para receber as instruções.'
              : mode === 'register'
                ? 'Crie seu espaço para as próximas descobertas.'
                : 'Suas ideias estão esperando por você.'}
          </p>
          <Card className="auth-form-card">
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
                    placeholder="voce@exemplo.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              )}
              <PasswordField
                visible={mode !== 'reset' || Boolean(resetToken)}
                newPassword={mode === 'register' || Boolean(resetToken)}
                password={password}
                setPassword={setPassword}
              />
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
              <Button
                className="auth-submit"
                size="lg"
                type="submit"
                disabled={pending}
              >
                {pending && (
                  <LoaderCircle
                    className="pending-spinner"
                    size={18}
                    aria-hidden="true"
                  />
                )}
                {pending
                  ? 'Aguarde…'
                  : mode === 'register'
                    ? 'Criar conta'
                    : mode === 'reset'
                      ? resetToken
                        ? 'Alterar senha'
                        : 'Enviar instruções'
                      : 'Entrar'}
                {!pending && <ArrowRight size={18} aria-hidden="true" />}
              </Button>
            </form>
          </Card>
          <AuthLinks mode={mode} />
          <p className="auth-footnote">
            <BookOpen size={14} aria-hidden="true" /> Um espaço seu para
            aprender melhor.
          </p>
        </BlurFade>
      </main>
    </div>
  );
}

function PasswordField({
  visible,
  newPassword,
  password,
  setPassword,
}: {
  visible: boolean;
  newPassword: boolean;
  password: string;
  setPassword: (value: string) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <>
      {visible && (
        <div className="field">
          <label htmlFor="password">Senha</label>
          <div className="password-control">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={newPassword ? 'new-password' : 'current-password'}
              required
              minLength={12}
              maxLength={128}
              placeholder={newPassword ? 'Crie uma senha segura' : 'Sua senha'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </Button>
          </div>
          {newPassword && (
            <span className="hint">Use de 12 a 128 caracteres.</span>
          )}
        </div>
      )}
    </>
  );
}
