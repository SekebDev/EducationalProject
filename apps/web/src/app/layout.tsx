import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Caderno · Professor de IA',
  description: 'Um lugar para perguntar, estudar e acompanhar sua prática.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
