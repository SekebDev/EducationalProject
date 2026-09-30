'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { StudyShell } from '../../features/study/StudyShell';
import { PracticeAction } from '../../features/insights/PracticeAction';
import { api, errorMessage } from '../../lib/api';

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
  seriesByLevel: Array<{
    level: string;
    date: string;
    points: number;
    possiblePoints: number;
    percentage: number;
    questionCount: number;
  }>;
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

function EvolutionContent() {
  const router = useRouter();
  const search = useSearchParams();
  const filterKey = search.toString();
  const [form, setForm] = useState({
    topicId: '',
    level: '',
    from: '',
    to: '',
  });
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    api<Insights>(`/insights${filterKey ? `?${filterKey}` : ''}`)
      .then((result) => {
        if (active) {
          setData(result);
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
  }, [filterKey]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      if (value.trim()) {
        params.set(key, value.trim());
      }
    }
    router.push(`/evolucao${params.size ? `?${params}` : ''}`);
  }

  return (
    <StudyShell title="Evolução">
      <main className="main-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Sua prática ao longo do tempo</span>
            <h2>Evolução</h2>
            <p>
              Notas calculadas apenas com respostas corrigidas de tentativas
              concluídas. Níveis aparecem separados.
            </p>
          </div>
        </div>
        <form
          className="insights-filters"
          onSubmit={apply}
          aria-label="Filtros de evolução"
        >
          <label>
            Tema{' '}
            <select
              value={form.topicId}
              onChange={(event) =>
                setForm({ ...form, topicId: event.target.value })
              }
            >
              <option value="">Todos</option>
              {[
                ...new Map(
                  data?.topics.map((topic) => [topic.topicId, topic.name]) ??
                    [],
                ).entries(),
              ].map(([topicId, name]) => (
                <option key={topicId} value={topicId}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nível{' '}
            <input
              value={form.level}
              onChange={(event) =>
                setForm({ ...form, level: event.target.value })
              }
              placeholder="Todos"
            />
          </label>
          <label>
            De{' '}
            <input
              type="date"
              value={form.from}
              onChange={(event) =>
                setForm({ ...form, from: event.target.value })
              }
            />
          </label>
          <label>
            Até, exclusive{' '}
            <input
              type="date"
              value={form.to}
              onChange={(event) => setForm({ ...form, to: event.target.value })}
            />
          </label>
          <button className="button" type="submit">
            Aplicar filtros
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p aria-busy="true">Calculando evolução…</p>
        ) : (
          data && (
            <>
              {data.status === 'pending' && (
                <p role="status">
                  Há correções pendentes. A nota aparecerá quando houver
                  respostas válidas.
                </p>
              )}
              {data.status === 'no_valid_evidence' && (
                <p role="status">
                  Sem base válida para calcular a nota neste filtro. Respostas
                  contestadas e tentativas excluídas não contam.
                </p>
              )}
              {data.status === 'ready' && (
                <section
                  aria-label="Resumo de desempenho"
                  className="result-score"
                >
                  <strong>{data.percentage?.toLocaleString('pt-BR')}%</strong>
                  <p>
                    {data.points?.toLocaleString('pt-BR')} de{' '}
                    {data.possiblePoints?.toLocaleString('pt-BR')} pontos ·{' '}
                    {data.questionCount} questões válidas
                  </p>
                  {(data.pendingCount > 0 || data.contestedCount > 0) && (
                    <p>
                      {data.pendingCount} pendentes · {data.contestedCount}{' '}
                      contestadas, fora do cálculo.
                    </p>
                  )}
                </section>
              )}
              <section
                className="insights-section"
                aria-labelledby="topics-title"
              >
                <h3 id="topics-title">Desempenho por tema</h3>
                {data.topics.length === 0 ? (
                  <p>Nenhum tema com resposta válida neste filtro.</p>
                ) : (
                  <div className="insights-topics">
                    {data.topics.map((topic) => (
                      <article
                        className="question-preview"
                        key={`${topic.topicId}-${topic.level}`}
                      >
                        <span className="eyebrow">{topic.level}</span>
                        <h4>{topic.name}</h4>
                        <p>
                          <strong>
                            {topic.percentage.toLocaleString('pt-BR')}%
                          </strong>{' '}
                          · {topic.points.toLocaleString('pt-BR')} de{' '}
                          {topic.possiblePoints.toLocaleString('pt-BR')} pontos
                          · {topic.questionCount} questões
                        </p>
                        <p>
                          {classLabel[topic.classification] ??
                            topic.classification}
                        </p>
                        <details>
                          <summary>Ver respostas consideradas</summary>
                          <ul>
                            {topic.evidence.map((item, index) => (
                              <li key={item.answerId}>
                                <Link
                                  href={`/tentativas/${item.attemptId}/resultado`}
                                >
                                  Resposta {index + 1} no resultado
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
              <section
                className="insights-section"
                aria-labelledby="series-title"
              >
                <h3 id="series-title">Evolução por data e nível</h3>
                {data.seriesByLevel.length === 0 ? (
                  <p>Sem pontos para representar.</p>
                ) : (
                  <>
                    <div
                      className="insights-chart"
                      role="img"
                      aria-label="Gráfico de barras com aproveitamento por data e nível; a tabela abaixo contém os mesmos valores"
                    >
                      {data.seriesByLevel.map((point) => (
                        <div
                          className="insights-bar"
                          key={`${point.level}-${point.date}`}
                        >
                          <span>
                            {point.date} · {point.level}
                          </span>
                          <div className="insights-track">
                            <div style={{ width: `${point.percentage}%` }} />
                          </div>
                          <strong>
                            {point.percentage.toLocaleString('pt-BR')}%
                          </strong>
                        </div>
                      ))}
                    </div>
                    <div className="table-wrap">
                      <table>
                        <caption>Valores da evolução por data e nível</caption>
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Nível</th>
                            <th>Questões</th>
                            <th>Pontos</th>
                            <th>Aproveitamento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.seriesByLevel.map((point) => (
                            <tr key={`${point.level}-${point.date}`}>
                              <td>{point.date}</td>
                              <td>{point.level}</td>
                              <td>{point.questionCount}</td>
                              <td>
                                {point.points.toLocaleString('pt-BR')} /{' '}
                                {point.possiblePoints}
                              </td>
                              <td>
                                {point.percentage.toLocaleString('pt-BR')}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
              <section
                className="insights-section"
                aria-labelledby="recommendations-title"
              >
                <h3 id="recommendations-title">Próximos passos</h3>
                {data.recommendations.length === 0 ? (
                  <p>
                    As recomendações aparecem após pelo menos três respostas
                    válidas de um tema que peça atenção ou desenvolvimento.
                  </p>
                ) : (
                  data.recommendations.map((item) => (
                    <article className="question-preview" key={item.id}>
                      <h4>
                        {item.topicName} · {item.level}
                      </h4>
                      <p>{item.action}</p>
                      <p>
                        {item.evidenceAnswerIds.length} respostas fundamentam
                        esta sugestão.
                      </p>
                      <PracticeAction recommendationId={item.id} />
                    </article>
                  ))
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
        <p className="main-content" aria-busy="true">
          Carregando evolução…
        </p>
      }
    >
      <EvolutionContent />
    </Suspense>
  );
}
