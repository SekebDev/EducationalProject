export const PERSONALITY_CATALOG_VERSION = 1;

export const personalities = {
  acolhedora: {
    key: 'acolhedora',
    name: 'Acolhedora',
    description: 'Explica com calma e usa exemplos próximos do estudante.',
    style: 'Use linguagem acolhedora, exemplos claros e encoraje perguntas.',
  },
  objetiva: {
    key: 'objetiva',
    name: 'Objetiva',
    description:
      'Vai direto ao conceito e organiza a resposta em passos curtos.',
    style: 'Seja direto, preciso e estruturado.',
  },
  socratica: {
    key: 'socratica',
    name: 'Socrática',
    description: 'Conduz o raciocínio com perguntas antes da síntese.',
    style: 'Conduza com perguntas úteis e depois sintetize a resposta.',
  },
} as const;

export type PersonalityKey = keyof typeof personalities;

const versions = { [PERSONALITY_CATALOG_VERSION]: personalities } as const;

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
