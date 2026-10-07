'use client';

import { useParams } from 'next/navigation';
import { StudyShell } from '../../../features/study/StudyShell';
import { AttemptClient } from '../../../features/attempts/AttemptClient';
import styles from '../../../features/attempts/practice.module.css';

export default function AttemptPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <StudyShell title="Tentativa">
      <main className={`main-content ${styles.stage}`}>
        <AttemptClient id={id} />
      </main>
    </StudyShell>
  );
}
