'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Conversation, Page, Student } from '@study/contracts';
import { api, errorMessage, RequestError } from '../../lib/api';

export function StudyShell({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

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
  }, [router]);

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

  useEffect(() => {
    if (open) {
      closeButton.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (!open) {
      return;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
      if (event.key === 'Tab') {
        const items = Array.from(
          document.querySelectorAll<HTMLElement>(
            '#study-sidebar a, #study-sidebar button',
          ),
        ).filter((item) => item.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === last &&
          first
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);

  async function logout() {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
      router.replace('/entrar');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  function closeMenu() {
    setOpen(false);
    menuButton.current?.focus();
  }

  if (loading) {
    return (
      <main className="main-content" aria-busy="true">
        <p>Carregando seu caderno…</p>
      </main>
    );
  }
  if (!student) {
    return (
      <main className="main-content">
        <p role="alert">{error || 'Redirecionando para a entrada…'}</p>
      </main>
    );
  }
  return (
    <div className="app-shell">
      <div className="mobile-nav">
        <Link className="brand" href="/conversas">
          <span className="brand-mark" aria-hidden="true">
            ◧
          </span>
          Caderno
        </Link>
        <button
          ref={menuButton}
          className="button secondary small"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="study-sidebar"
        >
          Menu
        </button>
      </div>
      <aside
        id="study-sidebar"
        className={`sidebar${open ? ' open' : ''}`}
        aria-label="Navegação principal"
      >
        <div>
          <Link
            className="brand"
            href="/conversas"
            onClick={() => setOpen(false)}
          >
            <span className="brand-mark" aria-hidden="true">
              ◧
            </span>
            Caderno
          </Link>
          <button
            ref={closeButton}
            className="button ghost small close-nav"
            onClick={closeMenu}
          >
            Fechar menu
          </button>
        </div>
        <nav aria-label="Áreas de estudo">
          <div className="nav-label">Estudar</div>
          <ul className="nav-list">
            <li>
              <Link
                href="/conversas"
                aria-current={pathname === '/conversas' ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                Conversas
              </Link>
            </li>
            <li>
              <Link
                href="/provas"
                aria-current={
                  pathname.startsWith('/provas') ? 'page' : undefined
                }
                onClick={() => setOpen(false)}
              >
                Provas
              </Link>
            </li>
            <li>
              <Link
                href="/evolucao"
                aria-current={pathname === '/evolucao' ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                Evolução
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Conversas recentes">
          <div className="nav-label">Recentes</div>
          <ul className="nav-list">
            {conversations.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/conversas/${item.id}`}
                  aria-current={
                    pathname === `/conversas/${item.id}` ? 'page' : undefined
                  }
                  onClick={() => setOpen(false)}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-bottom">
          <p>{student.email}</p>
          <button className="button ghost small" onClick={() => void logout()}>
            Sair da conta
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p>Professor de IA · Prática formativa</p>
          </div>
          <Link className="button secondary small" href="/conversas/nova">
            Nova conversa
          </Link>
        </header>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
