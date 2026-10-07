'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type DragEvent,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import type {
  Conversation,
  Message,
  Page,
  Personality,
  EducationalSkill,
  ResponseDepth,
} from '@study/contracts';
import { StudyShell } from '../../../features/study/StudyShell';
import {
  MaterialsPanel,
  useConversationMaterials,
} from '../../../features/materials/MaterialsPanel';
import { BlurFade } from '@/components/ui/blur-fade';
import { Button } from '@/components/ui/button';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  FileText,
  GraduationCap,
  Trash2,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { TeacherMenu } from '@/features/chat/TeacherMenu';
import { RichMessage } from '@/features/chat/RichMessage';
import { skillNames, depthNames } from '@/features/chat/StudySkillControls';
import skillStyles from '@/features/chat/study-skills.module.css';
import { api, errorMessage, RequestError } from '../../../lib/api';
import styles from '../conversation-flow.module.css';
import { PdfWorkspace } from '@/features/pdf-study/PdfWorkspace';
import { useConversationPdf } from '@/features/chat/use-conversation-pdf';
import { ConversationComposer } from '@/features/chat/ConversationComposer';
import { PaneResizeHandle } from '@/features/chat/PaneResizeHandle';
import { useConversationPaneSizes } from '@/features/chat/use-conversation-pane-sizes';
import {
  PdfConversationStatus,
  ReopenMessagePdf,
} from '@/features/chat/ConversationPdfContext';

const personalityNames: Record<Personality, string> = {
  acolhedora: 'Acolhedora',
  objetiva: 'Objetiva',
  socratica: 'Socrática',
};

function isFileDrag(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.types.includes('Files');
}

type Locator = { kind: 'page' | 'paragraph' | 'line'; number: number };

function locatorLabel(locator: Locator): string {
  const label =
    locator.kind === 'page'
      ? 'página'
      : locator.kind === 'paragraph'
        ? 'parágrafo'
        : 'linha';
  return `${label} ${locator.number}`;
}

async function fetchMessages(id: string, after?: string): Promise<Message[]> {
  const items: Message[] = [];
  let cursor: string | null | undefined = after;
  do {
    const page: Page<Message> = await api<Page<Message>>(
      `/conversations/${id}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [sourcePreview, setSourcePreview] = useState<{
    key: string;
    name: string;
    text: string;
    locator: Locator;
  } | null>(null);
  const reducedMotion = useReducedMotion();
  const messageScroll = useRef<HTMLDivElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const filesOpener = useRef<HTMLElement | null>(null);
  const followMessages = useRef(true);
  const [filesOpen, setFilesOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [pdfQuestion, setPdfQuestion] = useState('');
  const dragDepth = useRef(0);
  const paneSizes = useConversationPaneSizes();
  const activeMessage = messages.find(
    (message) =>
      message.role === 'assistant' &&
      ['queued', 'generating'].includes(message.state),
  );
  const active = Boolean(activeMessage);
  const preferencesDisabled = updating || active || sending;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1199px)');
    const update = () => {
      setCompact(media.matches);
      setFilesOpen(!media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const input = questionInput.current;
    if (input) {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
    }
  }, [content]);

  useEffect(() => {
    const scroll = messageScroll.current;
    if (scroll && followMessages.current) {
      scroll.scrollTo({
        top: scroll.scrollHeight,
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
    }
  }, [messages, reducedMotion]);

  function scrollToLatest() {
    followMessages.current = true;
    const scroll = messageScroll.current;
    scroll?.scrollTo({
      top: scroll.scrollHeight,
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content ?? '');
      setCopiedId(message.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError(
        'Não foi possível copiar. Selecione o texto e copie manualmente.',
      );
    }
  }

  const refresh = useCallback(async () => {
    const [nextConversation, allMessages] = await Promise.all([
      api<Conversation>(`/conversations/${id}`),
      fetchMessages(id),
    ]);
    setConversation(nextConversation);
    setMessages(allMessages);
  }, [id]);

  const materialController = useConversationMaterials({
    conversationId: id,
    conversationVersion: conversation?.version ?? 0,
    onChanged: refresh,
  });
  const pdf = useConversationPdf({
    conversationId: id,
    materials: materialController.materials,
    loading:
      materialController.loading ||
      materialController.loadedConversationId !== id,
    onError: setError,
  });

  function openPdf(materialId: string, pageId?: string) {
    if (sending || active) {
      setError('Aguarde a resposta atual terminar antes de abrir outro PDF.');
      return;
    }
    pdf.open(materialId, pageId);
    setFilesOpen(false);
    questionInput.current?.focus();
  }

  const preparePdfQuestion = useCallback((question: string) => {
    setContent(question);
    questionInput.current?.focus();
    questionInput.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  useEffect(() => {
    function resetDrag() {
      dragDepth.current = 0;
      setDraggingFiles(false);
    }
    function preventFileNavigation(event: globalThis.DragEvent) {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault();
      }
      if (event.type === 'drop') {
        resetDrag();
      }
    }
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    window.addEventListener('dragend', resetDrag);
    window.addEventListener('blur', resetDrag);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
      window.removeEventListener('dragend', resetDrag);
      window.removeEventListener('blur', resetDrag);
    };
  }, []);

  function enterFiles(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    dragDepth.current += 1;
    setDraggingFiles(true);
  }

  function leaveFiles(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) {
      return;
    }
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDraggingFiles(false);
    }
  }

  function dropFiles(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDraggingFiles(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      filesOpener.current = questionInput.current;
      setFilesOpen(true);
      void materialController.uploadFiles(files);
    }
  }

  useEffect(() => {
    let mounted = true;
    refresh()
      .catch((cause: unknown) => {
        if (mounted) {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!activeMessage) {
      return;
    }
    const sequence = activeMessage.sequence;
    let inFlight = false;
    let disposed = false;
    const timer = setInterval(() => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      void fetchMessages(id, String(Math.max(0, sequence - 1)))
        .then((updated) => {
          if (disposed) {
            return;
          }
          setMessages((previous) => [
            ...previous.filter((message) => message.sequence < sequence),
            ...updated,
          ]);
        })
        .catch((cause: unknown) => {
          if (!disposed) {
            setError(errorMessage(cause));
          }
        })
        .finally(() => {
          inFlight = false;
        });
    }, 1500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [activeMessage?.sequence, id]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversation || !content.trim() || sending || active || updating) {
      return;
    }
    setSending(true);
    setError('');
    try {
      if (pdf.materialId) {
        if (!pdf.bridge?.ready || pdf.bridge.blocked) {
          throw new Error(
            'Aguarde o PDF ficar pronto antes de enviar a pergunta.',
          );
        }
        setPdfQuestion(content.trim());
        const confirmed = await pdf.bridge.submit(content.trim());
        if (!confirmed) {
          throw new Error(
            'A explicação não foi confirmada. Sua pergunta continua no campo de mensagem; consulte o aviso no PDF para recuperar o resultado.',
          );
        }
        followMessages.current = true;
        setContent('');
        return;
      }
      await api(`/conversations/${id}/messages`, {
        method: 'POST',
        idempotent: true,
        body: {
          content: content.trim(),
          conversationVersion: conversation.version,
        },
      });
      followMessages.current = true;
      setContent('');
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof RequestError && cause.code === 'VERSION_CONFLICT') {
        await refresh().catch(() => undefined);
      }
    } finally {
      setPdfQuestion('');
      setSending(false);
    }
  }

  async function changePreferences(preferences: {
    personality?: Personality;
    skill?: EducationalSkill;
    responseDepth?: ResponseDepth;
  }) {
    if (!conversation || updating || active || sending) {
      return;
    }
    setUpdating(true);
    setError('');
    try {
      const updated = await api<Conversation>(`/conversations/${id}`, {
        method: 'PATCH',
        body: { ...preferences, version: conversation.version },
      });
      setConversation(updated);
    } catch (cause) {
      setError(errorMessage(cause));
      await refresh().catch(() => undefined);
    } finally {
      setUpdating(false);
    }
  }

  async function retry(operationId: string) {
    setError('');
    try {
      await api(`/operations/${operationId}/retry`, {
        method: 'POST',
        idempotent: true,
      });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function remove() {
    if (!conversation) {
      return;
    }
    if (
      !window.confirm(
        'Excluir esta conversa? As mensagens e os materiais deixam de ficar disponíveis. As provas já criadas são preservadas.',
      )
    ) {
      return;
    }
    setError('');
    try {
      await api<void>(`/conversations/${id}`, { method: 'DELETE' });
      window.dispatchEvent(new Event('conversations-changed'));
      router.push('/conversas');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function showSource(
    key: string,
    materialId: string,
    chunkId: string,
    name: string,
  ) {
    if (sourcePreview?.key === key) {
      setSourcePreview(null);
      return;
    }
    setError('');
    try {
      const chunk = await api<{ text: string; locator: Locator }>(
        `/materials/${materialId}/chunks/${chunkId}`,
      );
      setSourcePreview({ key, name, ...chunk });
      requestAnimationFrame(() => {
        document.getElementById(`source-preview-${key}`)?.focus();
      });
    } catch (cause) {
      setError(errorMessage(cause));
      await refresh().catch(() => undefined);
    }
  }

  function closeSource(key: string) {
    setSourcePreview(null);
    requestAnimationFrame(() => {
      document.getElementById(`source-trigger-${key}`)?.focus();
    });
  }

  const materials = conversation ? (
    <MaterialsPanel controller={materialController} onOpenPdf={openPdf} />
  ) : null;

  function renderConversation() {
    if (!conversation) {
      return null;
    }
    return (
      <main
        ref={paneSizes.containerRef}
        style={paneSizes.style}
        data-resizing={paneSizes.dragging || undefined}
        className={`${styles.chatLayout} ${!compact && filesOpen && !pdf.materialId ? styles.withFiles : ''} ${pdf.materialId ? styles.withPdf : ''}`}
        aria-label="Conversa"
        onDragEnter={enterFiles}
        onDragLeave={leaveFiles}
        onDragOver={(event) => {
          if (isFileDrag(event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={dropFiles}
      >
        {draggingFiles && (
          <div className={styles.chatDropOverlay} role="status">
            <Upload size={36} strokeWidth={1.5} aria-hidden="true" />
            <strong>Solte para adicionar à conversa</strong>
            <span>PDF, DOCX, TXT ou Markdown · Até 20 MB por arquivo</span>
          </div>
        )}
        <div className={styles.chatMain} id="conversation-chat-panel">
          <h2 className="sr-only">{conversation.title}</h2>
          <div
            ref={messageScroll}
            className={styles.messageScroll}
            onScroll={(event) => {
              const element = event.currentTarget;
              const nearBottom =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                100;
              followMessages.current = nearBottom;
              setAtBottom(nearBottom);
            }}
          >
            <div
              className={styles.messageColumn}
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.length === 0 ? (
                <BlurFade
                  delay={0}
                  duration={0.3}
                  className={styles.chatWelcome}
                >
                  <Sparkles size={30} strokeWidth={1.5} aria-hidden="true" />
                  <h3>O que você quer aprender hoje?</h3>
                  <p>Traga uma dúvida, peça um exemplo ou revise um assunto.</p>
                  <div className={styles.promptSuggestions}>
                    {[
                      'Explique um conceito com um exemplo',
                      'Me ajude a revisar um assunto',
                      'Faça perguntas para eu praticar',
                    ].map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        onClick={() => {
                          setContent(suggestion);
                          questionInput.current?.focus();
                        }}
                      >
                        {suggestion}
                        <ArrowUp size={16} aria-hidden="true" />
                      </Button>
                    ))}
                  </div>
                </BlurFade>
              ) : (
                messages.map((message) => (
                  <motion.article
                    key={message.id}
                    className={`message ${message.role} ${styles.chatMessage} ${message.role === 'user' ? styles.chatUser : styles.chatAssistant}`}
                    aria-label={
                      message.role === 'user'
                        ? 'Você'
                        : `Professor de IA · ${personalityNames[message.personality]}`
                    }
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <header className="sr-only">
                      {message.role === 'user'
                        ? 'Você'
                        : `Professor de IA · ${personalityNames[message.personality]}`}
                    </header>
                    {message.content &&
                      (message.role === 'user' ? (
                        <div className={styles.userBubble}>
                          {message.content}
                        </div>
                      ) : (
                        <>
                          <span className={skillStyles.messageMetadata}>
                            {skillNames[message.skill]} ·{' '}
                            {depthNames[message.responseDepth]}
                          </span>
                          <RichMessage
                            content={message.content}
                            skill={message.skill}
                          />
                        </>
                      ))}
                    <ReopenMessagePdf message={message} onOpen={openPdf} />
                    {message.references.length > 0 && (
                      <div className={styles.chatReferences}>
                        <strong>Fontes consultadas</strong>
                        <ul>
                          {message.references.map((reference) => {
                            const sourceKey = `${message.id}-${reference.chunkId}`;
                            const isOpen = sourcePreview?.key === sourceKey;
                            return (
                              <li key={sourceKey}>
                                {reference.available ? (
                                  <button
                                    type="button"
                                    className={styles.chatSource}
                                    id={`source-trigger-${sourceKey}`}
                                    aria-expanded={isOpen}
                                    aria-controls={
                                      isOpen
                                        ? `source-preview-${sourceKey}`
                                        : undefined
                                    }
                                    onClick={() =>
                                      void showSource(
                                        sourceKey,
                                        reference.materialId,
                                        reference.chunkId,
                                        reference.name,
                                      )
                                    }
                                  >
                                    <FileText size={14} aria-hidden="true" />
                                    {reference.name},{' '}
                                    {locatorLabel(reference.locator)}
                                  </button>
                                ) : (
                                  <span>
                                    Fonte indisponível · {reference.name}
                                  </span>
                                )}
                                {isOpen && sourcePreview && (
                                  <motion.aside
                                    className={styles.sourcePreview}
                                    id={`source-preview-${sourceKey}`}
                                    tabIndex={-1}
                                    aria-label="Trecho da fonte"
                                    initial={
                                      reducedMotion
                                        ? false
                                        : { opacity: 0, y: -6 }
                                    }
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Escape') {
                                        closeSource(sourceKey);
                                      }
                                    }}
                                  >
                                    <div className="material-row">
                                      <strong>
                                        {sourcePreview.name} ·{' '}
                                        {locatorLabel(sourcePreview.locator)}
                                      </strong>
                                      <button
                                        type="button"
                                        className={styles.closeSource}
                                        onClick={() => closeSource(sourceKey)}
                                      >
                                        Fechar
                                      </button>
                                    </div>
                                    <p>{sourcePreview.text}</p>
                                  </motion.aside>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {message.role === 'assistant' &&
                      message.state !== 'completed' && (
                        <div className={styles.chatStatus} role="status">
                          {message.state !== 'failed' && (
                            <span
                              className={styles.thinkingDots}
                              aria-hidden="true"
                            >
                              <i />
                              <i />
                              <i />
                            </span>
                          )}
                          {message.state === 'failed'
                            ? 'Não foi possível responder.'
                            : 'Preparando resposta…'}
                          {message.state === 'failed' &&
                            message.operationId && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void retry(message.operationId!)}
                              >
                                Tentar novamente
                              </Button>
                            )}
                        </div>
                      )}
                    {message.role === 'assistant' &&
                      message.state === 'completed' &&
                      message.content && (
                        <div className={styles.messageTools}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={
                              copiedId === message.id
                                ? 'Resposta copiada'
                                : 'Copiar resposta'
                            }
                            onClick={() => void copyMessage(message)}
                          >
                            {copiedId === message.id ? (
                              <Check size={16} aria-hidden="true" />
                            ) : (
                              <Copy size={16} aria-hidden="true" />
                            )}
                          </Button>
                          <span className={styles.responseStyle}>
                            {personalityNames[message.personality]}
                          </span>
                        </div>
                      )}
                  </motion.article>
                ))
              )}
              <PdfConversationStatus pdf={pdf} question={pdfQuestion} />
            </div>
          </div>
          {!atBottom && (
            <Button
              variant="outline"
              size="icon"
              className={styles.latestButton}
              aria-label="Ir para a última mensagem"
              onClick={scrollToLatest}
            >
              <ArrowDown size={18} aria-hidden="true" />
            </Button>
          )}
          <ConversationComposer
            conversation={conversation}
            content={content}
            setContent={setContent}
            input={questionInput}
            compact={compact}
            sending={sending}
            active={active}
            updating={updating}
            error={error}
            copied={Boolean(copiedId)}
            pdf={pdf}
            onSend={send}
            onPreferences={(preferences) => void changePreferences(preferences)}
            onOpenFiles={(opener) => {
              filesOpener.current = opener;
              setFilesOpen(true);
            }}
          />
        </div>
        {pdf.materialId && (
          <>
            <PaneResizeHandle
              {...paneSizes.pdf}
              kind="pdf"
              label="Ajustar largura da conversa e do PDF"
              controls="conversation-chat-panel conversation-pdf-panel"
              valueText={`Conversa: ${Math.round(paneSizes.pdf.value)}% do espaço`}
            />
            <section
              id="conversation-pdf-panel"
              className={styles.pdfPane}
              aria-label="PDF aberto na conversa"
            >
              <PdfWorkspace
                key={pdf.materialId}
                materialId={pdf.materialId}
                onClose={() => void pdf.close()}
                onBridge={pdf.receiveBridge}
                onCompleted={refresh}
                onRequestQuestion={preparePdfQuestion}
              />
            </section>
          </>
        )}
        {!compact && filesOpen && !pdf.materialId && (
          <>
            <PaneResizeHandle
              {...paneSizes.materials}
              kind="materials"
              label="Ajustar largura dos materiais"
              controls="conversation-chat-panel conversation-materials-panel"
              valueText={`Materiais: ${Math.round(paneSizes.materials.value)} pixels`}
            />
            <aside
              id="conversation-materials-panel"
              className={styles.filesRail}
              aria-label="Arquivos da conversa"
            >
              {materials}
            </aside>
          </>
        )}
        {(compact || Boolean(pdf.materialId)) && (
          <Sheet open={filesOpen} onOpenChange={setFilesOpen}>
            <SheetContent
              side="right"
              className={styles.filesSheet}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                filesOpener.current?.focus();
              }}
            >
              <SheetTitle className="sr-only">Materiais de apoio</SheetTitle>
              <SheetDescription className="sr-only">
                Envie arquivos e escolha as fontes que o professor deve
                consultar.
              </SheetDescription>
              {materials}
            </SheetContent>
          </Sheet>
        )}
      </main>
    );
  }

  return (
    <StudyShell
      title={conversation?.title ?? 'Conversa'}
      variant="chat"
      headerLeading={
        conversation ? (
          <TeacherMenu
            value={conversation.personality}
            disabled={preferencesDisabled}
            onChange={(value) => void changePreferences({ personality: value })}
          />
        ) : undefined
      }
      headerActions={
        conversation ? (
          <div className={styles.headerActions}>
            {messages.some(
              (message) =>
                message.role === 'user' && message.state === 'completed',
            ) && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label="Criar prova desta conversa"
              >
                <Link href={`/provas/nova?conversationId=${id}`}>
                  <GraduationCap size={20} aria-hidden="true" />
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              className={styles.filesTrigger}
              onClick={(event) => {
                filesOpener.current = event.currentTarget;
                setFilesOpen((open) => !open);
              }}
              aria-label="Materiais de apoio"
              aria-expanded={filesOpen}
            >
              <FileText size={18} aria-hidden="true" />
              <span>Materiais de apoio</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void remove()}
              aria-label="Excluir conversa"
            >
              <Trash2 size={18} aria-hidden="true" />
            </Button>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <main className={`main-content ${styles.loadingPage}`} aria-busy="true">
          <p className={styles.loadingLabel} role="status">
            Abrindo conversa…
          </p>
          <div className={styles.loadingHeading} aria-hidden="true" />
          <div className={styles.loadingMessage} aria-hidden="true" />
          <div className={styles.loadingMessage} aria-hidden="true" />
        </main>
      ) : !conversation ? (
        <main className={`main-content ${styles.unavailable}`}>
          <h2>Não encontramos esta conversa.</h2>
          <p className="form-error" role="alert">
            {error || 'Conversa indisponível.'}
          </p>
          <Button asChild variant="outline">
            <Link href="/conversas">Voltar às conversas</Link>
          </Button>
        </main>
      ) : (
        renderConversation()
      )}
    </StudyShell>
  );
}
