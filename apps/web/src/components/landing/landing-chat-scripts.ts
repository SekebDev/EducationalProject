export type DemoPersonality = 'acolhedora' | 'objetiva' | 'socratica';

export type DemoTurn = {
  question: string;
  answer: readonly string[];
};

export const demoTeachers = [
  {
    key: 'acolhedora',
    name: 'Acolhedora',
    description: 'Explica com calma e exemplos.',
  },
  {
    key: 'objetiva',
    name: 'Objetiva',
    description: 'Vai ao ponto, em passos curtos.',
  },
  {
    key: 'socratica',
    name: 'Socrática',
    description: 'Ajuda você a pensar com perguntas.',
  },
] as const;

export const demoConversations: Record<DemoPersonality, readonly DemoTurn[]> = {
  acolhedora: [
    {
      question: 'Por que a fotossíntese precisa de luz?',
      answer: [
        'Pense na planta como uma pequena cozinha. Água e gás carbônico são os ingredientes; a luz fornece a energia para transformar esses ingredientes em açúcares.',
        'A clorofila capta essa luz. Com essa energia, a planta consegue produzir seu próprio alimento.',
      ],
    },
    {
      question: 'Então a luz é energia, não alimento?',
      answer: [
        'Isso! Na nossa cozinha, a luz seria a energia que permite preparar a receita.',
        'O alimento produzido são os açúcares. A planta pode usá-los para obter energia e formar estruturas que ajudam no seu crescimento.',
      ],
    },
    {
      question: 'E de onde vem o oxigênio?',
      answer: [
        'Ele vem da água. Durante as reações que dependem de luz, moléculas de água são divididas e liberam oxigênio.',
        'O gás carbônico participa da formação dos açúcares. São papéis diferentes dentro do mesmo processo.',
      ],
    },
  ],
  objetiva: [
    {
      question: 'Por que a fotossíntese precisa de luz?',
      answer: [
        'A luz fornece energia para a fotossíntese. A clorofila absorve essa energia nas reações que dependem de luz.',
        'Essa energia permite produzir açúcares a partir de água e gás carbônico. O processo também libera oxigênio.',
      ],
    },
    {
      question: 'Então a luz é energia, não alimento?',
      answer: [
        'Sim. A luz é a fonte de energia; os açúcares são o alimento produzido.',
        'Água e gás carbônico fornecem a matéria-prima. A planta usa os açúcares para obter energia e construir suas estruturas.',
      ],
    },
    {
      question: 'E de onde vem o oxigênio?',
      answer: [
        'Da água, dividida durante as reações que dependem de luz.',
        'O oxigênio liberado na fotossíntese vem da água, não do gás carbônico.',
      ],
    },
  ],
  socratica: [
    {
      question: 'Por que a fotossíntese precisa de luz?',
      answer: [
        'Uma pista: transformar água e gás carbônico em açúcares exige energia. A luz fornece essa energia, captada pela clorofila.',
        'Sem essa energia disponível, a planta conseguiria produzir açúcares pela fotossíntese?',
      ],
    },
    {
      question: 'Não. Faltaria energia para produzir os açúcares.',
      answer: [
        'Isso. Você separou a fonte de energia do alimento produzido: luz e açúcares têm funções diferentes.',
        'Agora pense nos ingredientes: água e gás carbônico. Será que o oxigênio liberado vem necessariamente do gás carbônico?',
      ],
    },
    {
      question: 'E de onde vem o oxigênio?',
      answer: [
        'A pista está na fórmula da água: H₂O. Nas reações que dependem de luz, ela é dividida e libera oxigênio.',
        'O gás carbônico contribui para formar os açúcares. Como isso muda a ideia de que o oxigênio viria do gás carbônico?',
      ],
    },
  ],
};
