'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  CircleCheck,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { StudyShell } from '../../features/study/StudyShell';
import { PracticeAction } from '../../features/insights/PracticeAction';
import {
  ProgressChart,
  displayDate,
  type EvolutionPoint,
} from '../../features/insights/evolution/ProgressChart';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Progress } from '../../components/ui/progress';
import { BlurFade } from '../../components/ui/blur-fade';
import { NumberTicker } from '../../components/ui/number-ticker';
import styles from './evolution.module.css';

type Topic = {
  topicId: string;
  name: string;
  level: string;
  points: number;
  possiblePoints: number;
  questionCount: number;
  percentage: number;
  classification: string;
  evidence: Array<{ answerId: string; revisionId: string; attemptId: string }>;
};

type Insights = {
  status: 'ready' | 'pending' | 'no_valid_evidence';
  questionCount: number;
  pendingCount: number;
  contestedCount: number;
  points: number | null;
  possiblePoints: number | null;
  percentage: number | null;
  topics: Topic[];
  seriesByLevel: EvolutionPoint[];
  recommendations: Array<{
    id: string;
    topicName: string;
    level: string;
    action: string;
    evidenceAnswerIds: string[];
  }>;
};

const classLabel: Record<string, string> = {
  attention: 'Ponto de atenção',
  developing: 'Em desenvolvimento',
  strength: 'Ponto forte',
  insufficient_data: 'Dados insuficientes',
};

function LoadingOverview() {
  return (
    <div className={styles.loading} role="status" aria-busy="true">
      <span className="sr-only">Calculando evolução…</span>
      <div className={styles.skeletonSummary} />
      <div className={styles.skeletonChart} />
    </div>
  );
}

function EvolutionOverview({
  data,
  filtered,
}: {
  data: Insights;
  filtered: boolean;
}) {
  return (
    <>
      {data.status === 'ready' ? (
        <BlurFade
          className={styles.overview}
          aria-label="Resumo de desempenho"
          delay={0}
        >
          <div className={styles.primaryMetric}>
            <span>Aproveitamento geral</span>
            <strong>
              <NumberTicker value={data.percentage ?? 0} decimalPlaces={1} />{' '}
              <span className={styles.percent}>%</span>
            </strong>
            <p>
              {data.points?.toLocaleString('pt-BR')} de{' '}
              {data.possiblePoints?.toLocaleString('pt-BR')} pontos
            </p>
          </div>
          <div className={styles.secondaryMetric}>
            <CircleCheck size={20} aria-hidden="true" />
            <strong>
              <NumberTicker value={data.questionCount} />
            </strong>
            <span>questões válidas</span>
          </div>
          <div className={styles.secondaryMetric}>
            <BookOpen size={20} aria-hidden="true" />
            <strong>
              <NumberTicker
                value={new Set(data.topics.map((topic) => topic.topicId)).size}
              />
            </strong>
            <span>temas avaliados</span>
          </div>
          <p className={styles.calculationNote}>
            Os resultados consideram respostas já corrigidas de tentativas
            concluídas.
            {(data.pendingCount > 0 || data.contestedCount > 0) && (
              <>
                {' '}
                {data.pendingCount} pendentes · {data.contestedCount}{' '}
                contestadas, fora do cálculo.
              </>
            )}
          </p>
        </BlurFade>
      ) : (
        <Card className={styles.emptyOverview}>
          <BookOpen size={28} aria-hidden="true" />
          <div>
            <h3>
              {data.status === 'pending'
                ? 'Suas correções estão a caminho'
                : filtered
                  ? 'Ainda não há resultados neste filtro'
                  : 'Sua evolução começa com uma prova'}
            </h3>
            <p role="status">
              {data.status === 'pending'
                ? 'Há correções pendentes. A nota aparecerá quando houver respostas válidas.'
                : 'Ainda não há respostas válidas para calcular a nota com estes filtros. Respostas contestadas e tentativas excluídas ficam fora do cálculo.'}
            </p>
          </div>
          <Button asChild>
            <Link href="/provas/nova">
              Criar prova
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </Button>
        </Card>
      )}
    </>
  );
}

function EvolutionContent() {
  const router = useRouter();
  const search = useSearchParams();
  const filterKey = search.toString();
  const reduceMotion = useReducedMotion();
  const [form, setForm] = useState({
    topicId: '',
    level: '',
    from: '',
    to: '',
  });
  const [data, setData] = useState<Insights | null>(null);
  const [topicOptions, setTopicOptions] = useState<Record<string, string>>({});
  const [levelOptions, setLevelOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(filterKey);
    setForm({
      topicId: params.get('topicId') ?? '',
      level: params.get('level') ?? '',
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
    });
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    api<Insights>(`/insights${filterKey ? `?${filterKey}` : ''}`)
      .then((result) => {
        if (active) {
          setData(result);
          setTopicOptions((current) => ({
            ...current,
            ...Object.fromEntries(
              result.topics.map((topic) => [topic.topicId, topic.name]),
            ),
          }));
          setLevelOptions((current) =>
            [
              ...new Set([
                ...current,
                ...result.seriesByLevel.map((point) => point.level),
                ...result.topics.map((topic) => topic.level),
              ]),
            ].sort(),
          );
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [filterKey, retry]);

  function navigateFilters(values: typeof form) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value.trim()) {
        params.set(key, value.trim());
      }
    }
    router.push(`/evolucao${params.size ? `?${params}` : ''}`);
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateFilters(form);
  }

  const topics = [...(data?.topics ?? [])].sort((a, b) => {
    const order = ['attention', 'developing', 'insufficient_data', 'strength'];
    return (
      order.indexOf(a.classification) - order.indexOf(b.classification) ||
      a.percentage - b.percentage
    );
  });
  const hasDateFilter = Boolean(form.from || form.to);

  return (
    <StudyShell title="Evolução">
      <main className={`main-content ${styles.dashboard}`}>
        <header className={styles.heading}>
          <div>
            <h2>Evolução</h2>
            <p>Entenda seus resultados e escolha o que praticar a seguir.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/provas/nova">
              <BookOpen size={16} aria-hidden="true" />
              Nova prova
            </Link>
          </Button>
        </header>
        <details className={styles.filterPanel} open={Boolean(filterKey)}>
          <summary>
            <Filter size={16} aria-hidden="true" />
            <span>Filtrar resultados</span>
            {filterKey && <Badge variant="secondary">Filtros ativos</Badge>}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={styles.chevron}
            />
          </summary>
          <form
            className={`insights-filters ${styles.filters}`}
            onSubmit={apply}
            aria-label="Filtros de evolução"
          >
            <label>
              Tema
              <select
                value={form.topicId}
                onChange={(event) =>
                  setForm({ ...form, topicId: event.target.value })
                }
              >
                <option value="">Todos</option>
                {form.topicId && !topicOptions[form.topicId] && (
                  <option value={form.topicId}>Tema selecionado</option>
                )}
                {Object.entries(topicOptions).map(([topicId, name]) => (
                  <option key={topicId} value={topicId}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nível
              <input
                value={form.level}
                onChange={(event) =>
                  setForm({ ...form, level: event.target.value })
                }
                placeholder="Todos"
                list="evolution-levels"
              />
              <datalist id="evolution-levels">
                {levelOptions.map((level) => (
                  <option key={level} value={level} />
                ))}
              </datalist>
            </label>
            <label>
              De
              <input
                type="date"
                value={form.from}
                onChange={(event) =>
                  setForm({ ...form, from: event.target.value })
                }
              />
            </label>
            <label>
              Antes de (data não incluída)
              <input
                type="date"
                value={form.to}
                onChange={(event) =>
                  setForm({ ...form, to: event.target.value })
                }
              />
            </label>
            <div className={styles.filterActions}>
              <Button type="submit">Aplicar filtros</Button>
              {filterKey && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push('/evolucao')}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          </form>
        </details>
        {error && (
          <div className={styles.error} role="alert">
            <div>
              <strong>Não foi possível carregar a evolução.</strong>
              <p>{error}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setRetry((value) => value + 1)}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Tentar novamente
            </Button>
          </div>
        )}
        {loading ? (
          <LoadingOverview />
        ) : (
          data && (
            <>
              <EvolutionOverview data={data} filtered={Boolean(filterKey)} />
              <div className={styles.analysisGrid}>
                <Card className={styles.chartPanel}>
                  <div className={styles.sectionHeader}>
                    <h3 id="series-title">Seu desempenho ao longo do tempo</h3>
                    <p>Aproveitamento por data, separado por nível.</p>
                  </div>
                  {levelOptions.length > 1 && (
                    <div
                      className={styles.levelTabs}
                      aria-label="Filtrar por nível"
                    >
                      <Button
                        size="sm"
                        variant={form.level === '' ? 'secondary' : 'ghost'}
                        aria-pressed={form.level === ''}
                        onClick={() => navigateFilters({ ...form, level: '' })}
                      >
                        Todos os níveis
                      </Button>
                      {levelOptions.map((level) => (
                        <Button
                          key={level}
                          size="sm"
                          variant={form.level === level ? 'secondary' : 'ghost'}
                          aria-pressed={form.level === level}
                          onClick={() => navigateFilters({ ...form, level })}
                        >
                          {level}
                        </Button>
                      ))}
                    </div>
                  )}
                  {data.seriesByLevel.length === 0 ? (
                    <div className={styles.chartEmpty}>
                      <p>Ainda não há resultados para mostrar no gráfico.</p>
                      <span>
                        Conclua uma prova para registrar seu primeiro resultado.
                      </span>
                    </div>
                  ) : (
                    <>
                      <ProgressChart points={data.seriesByLevel} />
                      <details className={styles.chartData}>
                        <summary>
                          Ver dados do gráfico
                          <ChevronDown
                            size={16}
                            aria-hidden="true"
                            className={styles.chevron}
                          />
                        </summary>
                        <div
                          className={styles.tableWrap}
                          tabIndex={0}
                          role="region"
                          aria-label="Dados do gráfico"
                        >
                          <table>
                            <caption>
                              Valores da evolução por data e nível
                            </caption>
                            <thead>
                              <tr>
                                <th scope="col">Data</th>
                                <th scope="col">Nível</th>
                                <th scope="col">Questões</th>
                                <th scope="col">Pontos</th>
                                <th scope="col">Aproveitamento</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.seriesByLevel.map((point) => (
                                <tr key={`${point.level}-${point.date}`}>
                                  <td>{displayDate(point.date)}</td>
                                  <td>{point.level}</td>
                                  <td>{point.questionCount}</td>
                                  <td>
                                    {point.points.toLocaleString('pt-BR')} /{' '}
                                    {point.possiblePoints.toLocaleString(
                                      'pt-BR',
                                    )}
                                  </td>
                                  <td>
                                    {point.percentage.toLocaleString('pt-BR')}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </>
                  )}
                  {hasDateFilter && (
                    <p className={styles.rangeNote}>
                      Período filtrado. A data final não entra no cálculo.
                    </p>
                  )}
                </Card>
                <section
                  className={styles.nextSteps}
                  aria-labelledby="recommendations-title"
                >
                  <div className={styles.sectionHeader}>
                    <h3 id="recommendations-title">O que praticar agora</h3>
                    <p>Sugestões baseadas nas suas respostas.</p>
                  </div>
                  {data.recommendations.length === 0 ? (
                    <div className={styles.recommendationEmpty}>
                      <BookOpen size={22} aria-hidden="true" />
                      <p>
                        As recomendações aparecem após pelo menos três respostas
                        válidas de um tema que peça atenção ou desenvolvimento.
                      </p>
                      <Link href="/provas">
                        Continuar praticando
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </Link>
                    </div>
                  ) : (
                    data.recommendations.map((item) => (
                      <motion.article
                        key={item.id}
                        className={styles.recommendation}
                        initial={false}
                        whileHover={reduceMotion ? {} : { y: -2 }}
                        transition={{ duration: 0.18 }}
                      >
                        <Badge variant="outline">{item.level}</Badge>
                        <h4>{item.topicName}</h4>
                        <p>{item.action}</p>
                        <span className={styles.evidenceCount}>
                          Esta sugestão se baseia em{' '}
                          {item.evidenceAnswerIds.length} respostas.
                        </span>
                        <PracticeAction recommendationId={item.id} />
                      </motion.article>
                    ))
                  )}
                </section>
              </div>
              <section
                className={styles.topicsPanel}
                aria-labelledby="topics-title"
              >
                <div className={styles.sectionHeader}>
                  <h3 id="topics-title">Desempenho por tema</h3>
                  <p>Os temas que precisam de atenção aparecem primeiro.</p>
                </div>
                {topics.length === 0 ? (
                  <p className={styles.noTopics}>
                    Nenhum tema tem respostas válidas com estes filtros.
                  </p>
                ) : (
                  <div className={styles.topicList}>
                    {topics.map((topic) => (
                      <article
                        className={styles.topicRow}
                        key={`${topic.topicId}-${topic.level}`}
                      >
                        <div className={styles.topicIdentity}>
                          <h4>{topic.name}</h4>
                          <span>
                            {topic.level} · {topic.questionCount} questões
                          </span>
                        </div>
                        <div className={styles.topicScore}>
                          <strong>
                            {topic.percentage.toLocaleString('pt-BR')}%
                          </strong>
                          <Progress
                            value={Math.min(100, Math.max(0, topic.percentage))}
                            aria-label={`Aproveitamento em ${topic.name}: ${topic.percentage.toLocaleString('pt-BR')}%`}
                            className={styles.topicProgress}
                          />
                          <span>
                            {topic.points.toLocaleString('pt-BR')} de{' '}
                            {topic.possiblePoints.toLocaleString('pt-BR')}{' '}
                            pontos
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            topic.classification === 'attention'
                              ? styles.attention
                              : topic.classification === 'strength'
                                ? styles.strength
                                : styles.classification
                          }
                        >
                          {classLabel[topic.classification] ??
                            topic.classification}
                        </Badge>
                        <details className={styles.topicEvidence}>
                          <summary>
                            Ver respostas consideradas
                            <ChevronDown
                              size={15}
                              aria-hidden="true"
                              className={styles.chevron}
                            />
                          </summary>
                          <ul>
                            {topic.evidence.map((item, index) => (
                              <li key={item.answerId}>
                                <Link
                                  href={`/tentativas/${item.attemptId}/resultado#resposta-${item.answerId}`}
                                >
                                  Resposta {index + 1} no resultado
                                  <ArrowUpRight size={13} aria-hidden="true" />
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )
        )}
      </main>
    </StudyShell>
  );
}

export default function EvolutionPage() {
  return (
    <Suspense
      fallback={
        <div className={`main-content ${styles.dashboard}`}>
          <LoadingOverview />
        </div>
      }
    >
      <EvolutionContent />
    </Suspense>
  );
}
