import { educationalSkillSchema, responseDepthSchema } from '@study/contracts';
import type { EducationalSkill, ResponseDepth } from '@study/contracts';

export const EDUCATIONAL_SKILL_VERSION = 1;

// Pedagogy adapted from EduClaude (MIT); see docs/third-party/EduClaude-LICENSE.txt.
const skillInstructions: Record<EducationalSkill, string> = {
  explicar:
    'Construa a compreensão: intuição em linguagem comum, exemplo concreto, conceito formal e aplicação. Explique pré-requisitos relevantes sem presumir que o estudante não os conhece. Em um exemplo resolvido, justifique cada passagem e mostre como conferir o resultado. Explique onde uma analogia deixa de valer. Identifique um erro comum e ofereça uma pergunta de transferência para uma situação nova. Responda diretamente quando a pergunta for pontual; não adie a explicação com perguntas de calibragem desnecessárias.',
  praticar:
    'Conduza prática deliberada: proponha um problema adequado ao tema e uma etapa por vez. Antes da tentativa do estudante, não revele a solução nem o gabarito. Depois da tentativa, identifique exatamente o passo correto ou o equívoco, explique por quê e dê uma pista proporcional. Se ele pedir a resolução ou continuar com dificuldade, ofereça um exemplo trabalhado e uma nova tentativa semelhante. Não atribua notas oficiais nem declare domínio a partir de uma única resposta.',
  revisar:
    'Conduza recuperação ativa: formule uma pergunta de compreensão ou aplicação por vez e espere a resposta antes de revelar a explicação. Use o histórico para comparar a tentativa com o conceito correto e retome o pré-requisito que faltar. Varie assuntos relacionados quando houver material suficiente. No fechamento, sintetize os tópicos que ainda merecem atenção, com evidências das tentativas; não invente porcentagens, histórico, datas ou um cronograma de revisão.',
  flashcards:
    'Gere até seis flashcards do tema solicitado. Uma ideia por cartão; a pergunta não deve denunciar a resposta. Evite verdadeiro/falso sem justificativa e associação puramente decorativa. Fórmulas precisam de aplicação, condição de validade ou derivação. Em cada segmento, escreva exatamente este formato Markdown: ### Cartão N, depois Frente: pergunta, depois Verso: resposta e explicação breve. Não escreva respostas antes de Verso:; o app recolhe o verso. Use uma fonte correta por cartão quando houver suporte; conhecimentos adicionais são basis=general. Não prometa salvar uma biblioteca de cards, calcular intervalos ou agendar revisão: os cartões ficam nesta conversa.',
};

const depthInstructions: Record<ResponseDepth, string> = {
  resumida:
    'Seja conciso, preservando o conceito, as condições e o raciocínio indispensável. Brevidade nunca justifica uma resposta vaga.',
  equilibrada:
    'Desenvolva o conceito, um exemplo explicado e os principais cuidados. Use parágrafos completos e justifique as etapas essenciais.',
  aprofundada:
    'Ensine com profundidade útil. Para perguntas conceituais amplas, desenvolva pré-requisitos, intuição, explicação formal, exemplo trabalhado com justificativas, condições de aplicação, erros comuns e uma verificação de compreensão. Não reduza uma aula solicitada a duas frases ou tópicos telegráficos. Aprofunde as relações e o porquê, sem repetir ideias ou alongar saudações. Para perguntas pontuais, responda na medida necessária. Nas skills interativas, aprofunde pistas e feedback depois da tentativa, mantendo uma pergunta por vez e sem antecipar o gabarito.',
};

export function educationalSkillAtVersion(
  key: EducationalSkill,
  version: number,
): string {
  if (version !== EDUCATIONAL_SKILL_VERSION) {
    throw new Error('EDUCATIONAL_SKILL_VERSION_UNAVAILABLE');
  }
  return skillInstructions[educationalSkillSchema.parse(key)];
}

export function teachingSettings(
  skill: unknown = 'explicar',
  depth: unknown = 'aprofundada',
  version = EDUCATIONAL_SKILL_VERSION,
) {
  const key = educationalSkillSchema.parse(skill);
  const responseDepth = responseDepthSchema.parse(depth);
  return {
    skill: key,
    responseDepth,
    instructions: `Método educacional validado: ${key} (v${version}). ${educationalSkillAtVersion(key, version)}\nProfundidade validada: ${responseDepth}. ${depthInstructions[responseDepth]}\nO método selecionado prevalece sobre a personalidade na sequência da atividade; a personalidade ajusta o tom. Ambos preservam as regras de fontes e limites do professor.`,
    maxOutputTokens: { resumida: 2000, equilibrada: 4000, aprofundada: 6000 }[
      responseDepth
    ],
    verbosity: { resumida: 'low', equilibrada: 'medium', aprofundada: 'high' }[
      responseDepth
    ] as 'low' | 'medium' | 'high',
  };
}
