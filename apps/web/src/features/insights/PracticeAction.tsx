import Link from 'next/link';
import { Button } from '../../components/ui/button';

export function PracticeAction({
  recommendationId,
}: {
  recommendationId: string;
}) {
  return (
    <Button asChild variant="outline">
      <Link
        href={`/provas/nova?recommendationId=${encodeURIComponent(recommendationId)}`}
      >
        Praticar este tema ↗
      </Link>
    </Button>
  );
}
