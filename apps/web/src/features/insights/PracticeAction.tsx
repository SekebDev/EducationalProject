import Link from 'next/link';

export function PracticeAction({
  recommendationId,
}: {
  recommendationId: string;
}) {
  return (
    <Link
      className="button secondary small"
      href={`/provas/nova?recommendationId=${encodeURIComponent(recommendationId)}`}
    >
      Praticar este tema
    </Link>
  );
}
