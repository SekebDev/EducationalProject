import type { ReactNode } from 'react';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/fraunces';
import './globals.css';
import { StudyMotion } from '@/components/StudyMotion';

export const metadata = {
  title: 'Caderno · Professor de IA',
  description: 'Um lugar para perguntar, estudar e acompanhar sua prática.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <StudyMotion>{children}</StudyMotion>
      </body>
    </html>
  );
}
