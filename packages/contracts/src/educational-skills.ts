import { z } from 'zod';

export const educationalSkillSchema = z.enum([
  'explicar',
  'praticar',
  'revisar',
  'flashcards',
]);
export const responseDepthSchema = z.enum([
  'resumida',
  'equilibrada',
  'aprofundada',
]);
export type EducationalSkill = z.infer<typeof educationalSkillSchema>;
export type ResponseDepth = z.infer<typeof responseDepthSchema>;

export const educationalSkills = [
  {
    key: 'explicar',
    name: 'Explicar passo a passo',
    description:
      'Entenda a ideia, acompanhe um exemplo e veja por que funciona.',
  },
  {
    key: 'praticar',
    name: 'Prática guiada',
    description:
      'Resolva uma etapa por vez, com pistas e feedback sobre sua tentativa.',
  },
  {
    key: 'revisar',
    name: 'Revisão ativa',
    description:
      'Recupere da memória antes de conferir e identificar o que revisar.',
  },
  {
    key: 'flashcards',
    name: 'Flashcards',
    description:
      'Crie cartões com uma ideia por vez e revele a resposta quando quiser.',
  },
] as const;

export const responseDepths = [
  {
    key: 'resumida',
    name: 'Resumida',
    description: 'Resposta direta, com o raciocínio essencial.',
  },
  {
    key: 'equilibrada',
    name: 'Equilibrada',
    description: 'Conceito, exemplo e principais cuidados.',
  },
  {
    key: 'aprofundada',
    name: 'Aprofundada',
    description: 'Intuição, passos explicados, exemplos e limites.',
  },
] as const;
