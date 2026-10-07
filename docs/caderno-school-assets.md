# Assets do Caderno: papel rasgado e escola bagunçada

O kit contém os elementos utilizados no segundo vídeo-conceito, separados para montagem da landing page. Os papéis e os objetos não têm títulos ou frases incorporados: mantenha todo o conteúdo da página em HTML para preservar nitidez, seleção de texto e acessibilidade.

## Arquivos prontos para o navegador

Pasta: `apps/web/public/landing/school-kit/`. A URL pública começa em `/landing/school-kit/`.

| Pasta           | Conteúdo                                                        | Uso                                                       |
| --------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| `images/`       | 17 imagens WebP e 17 versões com até 320 px                     | Papéis, fundos e objetos 3D renderizados                  |
| `masks/`        | 11 silhuetas SVG com bordas rasgadas                            | Recortes escaláveis, máscaras e papéis com cores próprias |
| `decorations/`  | 3 SVGs de rabiscos e seta                                       | Anotações decorativas em qualquer resolução               |
| `models/`       | Lápis, borracha, clipe e papel amassado em GLB separado         | Rotação e movimento reais em um renderer 3D               |
| `manifest.json` | Caminhos, dimensões, transparência, paleta e origem dos modelos | Seleção e posicionamento dos assets                       |

O pacote para download também contém PNGs originais, a cena Blender `.blend`, o GLB da cena completa e os scripts de criação. O vídeo usa renderizações 3D como imagens; os GLBs permitem construir uma versão com câmera e rotação 3D no navegador.

## Inventário visual

- `paper-ruled-cream`, `paper-ruled-sage` e `paper-ruled-mint`: folhas pautadas com furos de caderno.
- `paper-ruled-warm` e `paper-ruled-ivory`: folhas pautadas sem furos.
- `paper-yellow`, `paper-pink` e `paper-lilac`: papéis coloridos para a bagunça inicial.
- `torn-strip-cream`, `torn-strip-yellow` e `torn-strip-sage`: faixas rasgadas para títulos e marcações.
- `chalkboard` e `warm-paper-background`: fundos escuro e claro da transição.
- `pencil`, `eraser`, `crumpled-paper` e `paperclip`: objetos 3D com fundo transparente.

## Usar uma imagem

```html
<img
  src="/landing/school-kit/images/pencil.webp"
  alt=""
  aria-hidden="true"
  class="school-object"
/>
```

```css
.school-object {
  position: absolute;
  width: clamp(90px, 15vw, 230px);
  height: auto;
  pointer-events: none;
  user-select: none;
  transform-origin: 50% 50%;
  filter: drop-shadow(8px 16px 14px rgb(0 0 0 / 18%));
}
```

Use as dimensões de `manifest.json` para reservar espaço quando a imagem participar do fluxo da página. Use os arquivos `*-320.webp` em cenas pequenas no mobile. Os fundos são opacos; as folhas, faixas e quatro objetos preservam transparência. Os objetos foram recortados com margem de 12 px: suas dimensões diferem dos PNGs originais de 600 × 600. Para reproduzir exatamente a composição do vídeo, consulte `original.cropBox` no manifesto ou use o PNG original.

## Texto sobre papel rasgado

```css
.school-paper {
  position: relative;
  padding: 12% 11%;
  color: #193f34;
  background: url('/landing/school-kit/images/paper-ruled-cream.webp') center /
    100% 100% no-repeat;
}
```

Os recortes possuem proporções próprias; mantenha a proporção indicada no manifesto quando quiser preservar o tamanho das pautas e dos furos. A área de segurança recomendada para texto é de pelo menos 12% nas laterais. O campo `safePaddingRatio` é uma orientação de layout; confira que o texto não alcança as bordas, furos ou dobra inferior.

## Recolorir uma silhueta ou rabisco

```css
.torn-shape {
  background: #eea7c1;
  mask: url('/landing/school-kit/masks/paper-pink.svg') center / 100% 100%
    no-repeat;
}

.school-arrow {
  background: currentColor;
  mask: url('/landing/school-kit/decorations/loop-arrow.svg') center / contain
    no-repeat;
}
```

As máscaras reproduzem o contorno rasgado e os furos, sem o grão, as pautas ou a dobra dos WebPs. Os rabiscos usam `currentColor` quando inseridos como SVG inline; para um arquivo externo, use a máscara acima para aplicar a cor do elemento.

## Objetos GLB

Carregue cada GLB de forma independente. Os materiais estão incorporados, sem imagens externas. Todos os arquivos usam eixo Y para cima e escala em metros. A origem de cada arquivo foi reposicionada no corpo do objeto para facilitar `position`, `rotation` e `scale`. Os arquivos individuais não incluem as luzes ou a câmera da cena completa; configure luz ambiente e uma luz principal no renderer. Não contêm animações incorporadas: o movimento flutuante e a organização devem ser controlados pela página.

Para conservar o desempenho, comece com WebP para os objetos flutuantes. Carregue GLB apenas onde a rotação tridimensional contribuir para a experiência. O acabamento metálico do clipe depende da iluminação e do ambiente do renderer.

## Direção de movimento

| Elemento         | Caos inicial                                            | Durante a rolagem                      | Organização final                                               |
| ---------------- | ------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| Papéis           | Sobreposição, inclinação de aproximadamente −18° a +20° | Alinhar posição e rotação em sequência | Quatro módulos legíveis: dúvidas, materiais, prática e evolução |
| Lápis e borracha | Flutuação curta, sombra e escalas diferentes            | Deslocamento mais lento que o papel    | Repousar nas bordas da composição                               |
| Clipe            | Flutuar em primeiro plano                               | Reduzir escala e aproximar da folha    | Fixar no canto do módulo de materiais                           |
| Papel amassado   | Primeiro plano, parcialmente fora do enquadramento      | Afastar e reduzir a opacidade          | Sair da cena                                                    |
| Fundo            | Quadro escuro                                           | Misturar com o fundo de papel claro    | Marfim, verde profundo e detalhes amarelos                      |

Use o progresso de rolagem já disponível na página para interpolar os valores. Separe o transform de flutuação do transform de organização em elementos aninhados, evitando que as duas animações disputem a mesma propriedade. No mobile, reduza a quantidade de objetos e a distância dos movimentos. Com `prefers-reduced-motion: reduce`, mostre diretamente a composição organizada. Imagens decorativas devem usar `alt=""`, ficar fora da navegação por teclado e não bloquear cliques.

## Verificação e reprodução

O preparo verifica dimensões, preservação exata do canal alpha no WebP principal e integridade dos blocos e intervalos de buffers de cada GLB. Não equivale a uma validação visual do seu futuro renderer 3D ou à integração da animação na página.

O script `scripts/prepare-school-assets.py` aceita um diretório com `higgsedit-original.zip`, `school-props.glb` e `school-props.blend`:

```sh
python scripts/prepare-school-assets.py --source CAMINHO_DAS_FONTES --public apps/web/public/landing/school-kit --kit CAMINHO_DO_PACOTE
```

Requer Python e Pillow. Não faz chamadas de rede. A prévia e o relatório de tamanhos e verificações são gerados na pasta do pacote.
