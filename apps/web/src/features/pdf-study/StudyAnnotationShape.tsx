import { wrapStudyText, type StudyAnnotation } from '@study/contracts';

export function StudyAnnotationShape({
  annotation,
  selected = false,
}: {
  annotation: StudyAnnotation;
  selected?: boolean;
}) {
  const { x, y, width, height, color, strokeWidth, kind } = annotation;
  const stroke = { stroke: color, strokeWidth, fill: 'none' };
  const end = annotation.points.at(-1) ?? { x: x + width, y: y + height };
  const start = annotation.points[0] ?? { x, y };
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(8, strokeWidth * 4);
  return (
    <g>
      {kind === 'highlight' && (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={color}
          opacity={0.3}
        />
      )}
      {kind === 'ellipse' && (
        <ellipse
          cx={x + width / 2}
          cy={y + height / 2}
          rx={width / 2}
          ry={height / 2}
          {...stroke}
        />
      )}
      {kind === 'arrow' && (
        <path
          d={`M${start.x},${start.y} L${end.x},${end.y} M${end.x - head * Math.cos(angle - Math.PI / 6)},${end.y - head * Math.sin(angle - Math.PI / 6)} L${end.x},${end.y} L${end.x - head * Math.cos(angle + Math.PI / 6)},${end.y - head * Math.sin(angle + Math.PI / 6)}`}
          {...stroke}
          strokeLinecap="round"
        />
      )}
      {kind === 'pen' && (
        <polyline
          points={annotation.points.map((p) => `${p.x},${p.y}`).join(' ')}
          {...stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {kind === 'note' && (
        <>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="#fff9df"
            stroke={color}
            strokeWidth={0.75}
            rx={3}
          />
          <text
            x={x + 8}
            y={y + 8 + annotation.fontSize}
            fontFamily="Noto Sans Study, sans-serif"
            fontSize={annotation.fontSize}
            fill="#1d352d"
          >
            {wrapStudyText(
              annotation.text,
              width - 16,
              annotation.fontSize,
            ).map((line, index) => (
              <tspan
                key={index}
                x={x + 8}
                dy={index === 0 ? 0 : annotation.fontSize * 1.4}
              >
                {line}
              </tspan>
            ))}
          </text>
        </>
      )}
      {selected && (
        <rect
          x={x - 3}
          y={y - 3}
          width={width + 6}
          height={height + 6}
          fill="none"
          stroke="#245dab"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}
    </g>
  );
}
