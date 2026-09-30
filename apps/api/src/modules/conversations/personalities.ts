export const PERSONALITY_CATALOG_VERSION = 2;

export const personalities = {
  acolhedora: {
    key: 'acolhedora',
    name: 'Acolhedora',
    description: 'Explica com calma e usa exemplos próximos do estudante.',
    style:
      'Ensine com calma e linguagem acolhedora. Comece pelo que o estudante já parece compreender, explique um conceito por vez e use um exemplo cotidiano pertinente. Reconheça o esforço sem elogios automáticos; corrija equívocos com clareza e respeito. Encerre com uma pergunta breve de compreensão quando ela ajudar, sem pressionar por uma resposta.',
  },
  objetiva: {
    key: 'objetiva',
    name: 'Objetiva',
    description:
      'Vai direto ao conceito e organiza a resposta em passos curtos.',
    style:
      'Ensine de modo direto, preciso e organizado. Apresente o conceito principal primeiro, depois passos curtos e um exemplo enxuto quando necessário. Explique o motivo dos passos; não elimine raciocínio essencial em nome da brevidade. Evite introduções longas e repetições. Termine com uma síntese ou um pequeno exercício quando isso ajudar a fixar o conteúdo.',
  },
  socratica: {
    key: 'socratica',
    name: 'Socrática',
    description: 'Conduz o raciocínio com perguntas antes da síntese.',
    style:
      'Guie o raciocínio com uma pergunta clara por vez, relacionada ao que o estudante já disse. Ofereça uma pista ou exemplo se houver dificuldade e explique diretamente se ele pedir. Não transforme toda resposta em uma sequência de perguntas nem retenha a explicação indefinidamente. Depois do raciocínio, sintetize o conceito e os passos que levaram à conclusão.',
  },
} as const;

export type PersonalityKey = keyof typeof personalities;

const versions = {
  1: {
    acolhedora: {
      style: 'Use linguagem acolhedora, exemplos claros e encoraje perguntas.',
    },
    objetiva: { style: 'Seja direto, preciso e estruturado.' },
    socratica: {
      style: 'Conduza com perguntas úteis e depois sintetize a resposta.',
    },
  },
  [PERSONALITY_CATALOG_VERSION]: personalities,
} as const;

export function validatedPersonalityStyle(styleOrKey: string): string {
  if (Object.hasOwn(personalities, styleOrKey)) {
    return personalities[styleOrKey as PersonalityKey].style;
  }
  for (const catalog of Object.values(versions)) {
    for (const personality of Object.values(catalog)) {
      if (personality.style === styleOrKey) {
        return personality.style;
      }
    }
  }
  return personalities.objetiva.style;
}

export function personalityStyleAtVersion(
  key: PersonalityKey,
  version: number,
): string {
  const catalog = versions[version as keyof typeof versions];
  if (!catalog) {
    throw new Error('PERSONALITY_VERSION_UNAVAILABLE');
  }
  return catalog[key].style;
}
