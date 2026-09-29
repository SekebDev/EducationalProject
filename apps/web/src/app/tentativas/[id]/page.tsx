'use client';

import { useParams } from 'next/navigation';
import { StudyShell } from '../../../features/study/StudyShell';
import { AttemptClient } from '../../../features/attempts/AttemptClient';

export default function AttemptPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <StudyShell title="Tentativa">
      <main className="main-content">
        <AttemptClient id={id} />
      </main>
    </StudyShell>
  );
}
