'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  GraduationCap,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import type { Conversation, Page, Student } from '@study/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { api, errorMessage, RequestError } from '../../lib/api';

const areas = [
  { href: '/conversas', label: 'Conversas', icon: MessageCircle },
  { href: '/provas', label: 'Provas', icon: GraduationCap },
  { href: '/evolucao', label: 'Evolução', icon: TrendingUp },
];

export function StudyShell({
  children,
  title,
  headerLeading,
  headerActions,
  variant = 'default',
}: {
  children: ReactNode;
  title: string;
  headerLeading?: ReactNode;
  headerActions?: ReactNode;
  variant?: 'default' | 'chat';
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [student, setStudent] = useState<Student | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api<Student>('/auth/me')
      .then((data) => {
        if (active) {
          setStudent(data);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        if (cause instanceof RequestError && cause.status === 401) {
          router.replace(
            `/entrar?expired=1&returnTo=${encodeURIComponent(pathname)}`,
          );
        } else {
          setError(errorMessage(cause));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [router, pathname]);

  useEffect(() => {
    if (!student) {
      return;
    }
    let active = true;
    const refresh = () => {
      api<Page<Conversation>>('/conversations')
        .then((data) => {
          if (active) {
            setConversations(data.items);
          }
        })
        .catch((cause: unknown) => {
          if (active) {
            setError(errorMessage(cause));
          }
        });
    };
    refresh();
    window.addEventListener('conversations-changed', refresh);
    return () => {
      active = false;
      window.removeEventListener('conversations-changed', refresh);
    };
  }, [student, pathname]);

  async function logout() {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
      router.replace('/entrar');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const navigation = (mobile = false) => (
    <div className="sidebar-inner">
      <Link
        className="brand sidebar-brand"
        href="/conversas"
        onClick={() => setOpen(false)}
      >
        <span className="brand-symbol">
          <BookOpen size={22} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <span>
          Caderno<span className="brand-caption">seu estúdio de estudo</span>
        </span>
      </Link>
      <Button asChild className="sidebar-create">
        <Link href="/conversas/nova" onClick={() => setOpen(false)}>
          <Plus size={18} aria-hidden="true" /> Nova conversa{' '}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </Button>
      <nav aria-label="Áreas de estudo">
        <div className="nav-label">Seu espaço</div>
        <ul className="nav-list primary-nav">
          {areas.map(({ href, label, icon: Icon }) => {
            const selected =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {selected && (
                    <motion.span
                      className="nav-active"
                      layoutId={mobile ? 'mobile-nav-active' : 'nav-active'}
                      transition={{ duration: reduceMotion ? 0 : 0.24 }}
                    />
                  )}
                  <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
                  <span>{label}</span>
                  {selected && <ChevronRight size={15} aria-hidden="true" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <nav className="recent-nav" aria-label="Conversas recentes">
        <div className="nav-label">
          Retome uma ideia <span>{conversations.length}</span>
        </div>
        <ul className="nav-list recent-list">
          {conversations.slice(0, 6).map((item) => (
            <li key={item.id}>
              <Link
                href={`/conversas/${item.id}`}
                aria-current={
                  pathname === `/conversas/${item.id}` ? 'page' : undefined
                }
                onClick={() => setOpen(false)}
              >
                <span className="recent-dot" aria-hidden="true" />
                <span>{item.title}</span>
              </Link>
            </li>
          ))}
        </ul>
        {!conversations.length && (
          <p className="recent-empty">Suas conversas vão aparecer aqui.</p>
        )}
      </nav>
      <div className="sidebar-note">
        <Sparkles size={18} aria-hidden="true" />
        <p>
          Uma pergunta de cada vez.
          <br />
          <strong>Um pouco mais longe.</strong>
        </p>
      </div>
      <div className="sidebar-bottom">
        <div className="student-profile">
          <span className="student-avatar" aria-hidden="true">
            {student?.email.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>Meu caderno</strong>
            <p>{student?.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="logout-button"
          onClick={() => void logout()}
        >
          <LogOut size={16} aria-hidden="true" />
          Sair da conta
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <main className="shell-loading" aria-busy="true">
        <BookOpen aria-hidden="true" />
        <p>Preparando seu espaço de estudo…</p>
        <div className="loading-track" aria-hidden="true" />
      </main>
    );
  }
  if (!student) {
    return (
      <main className="main-content">
        <p role="alert">{error || 'Abrindo a página de entrada…'}</p>
      </main>
    );
  }

  return (
    <div className={`app-shell${variant === 'chat' ? ' app-shell-chat' : ''}`}>
      <aside className="sidebar" aria-label="Navegação principal">
        {navigation()}
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-context">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="mobile-menu"
                  aria-label="Menu"
                >
                  <Menu size={20} aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="study-drawer">
                <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
                <SheetDescription className="sr-only">
                  Áreas de estudo e conversas recentes.
                </SheetDescription>
                {navigation(true)}
              </SheetContent>
            </Sheet>
            {headerLeading ?? <h1 title={title}>{title}</h1>}
          </div>
          <div className="topbar-actions">
            {headerActions ?? (
              <>
                <Badge variant="outline" className="teacher-status">
                  <span aria-hidden="true" />
                  Professor de IA
                </Badge>
                <Button asChild variant="outline" className="topbar-create">
                  <Link href="/conversas/nova">
                    <Plus size={16} aria-hidden="true" />
                    Nova conversa
                  </Link>
                </Button>
              </>
            )}
          </div>
        </header>
        {error && (
          <p className="form-error shell-error" role="alert">
            {error}
          </p>
        )}
        {variant === 'chat' ? (
          <div className="shell-page shell-page-chat">{children}</div>
        ) : (
          <BlurFade
            key={pathname}
            className="shell-page"
            offset={10}
            blur="3px"
            duration={0.35}
          >
            {children}
          </BlurFade>
        )}
      </div>
    </div>
  );
}
