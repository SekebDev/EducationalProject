'use client';

import { ChevronDown, HeartHandshake, Lightbulb, Zap } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import type { Personality } from '@study/contracts';
import { Button } from '@/components/ui/button';
import styles from '../../app/conversas/conversation-flow.module.css';

const teachers = [
  {
    key: 'acolhedora',
    name: 'Acolhedora',
    description: 'Explica com calma e exemplos.',
    icon: HeartHandshake,
  },
  {
    key: 'objetiva',
    name: 'Objetiva',
    description: 'Vai ao ponto, em passos curtos.',
    icon: Zap,
  },
  {
    key: 'socratica',
    name: 'Socrática',
    description: 'Ajuda você a pensar com perguntas.',
    icon: Lightbulb,
  },
] as const;

export function TeacherMenu({
  value,
  disabled,
  onChange,
}: {
  value: Personality;
  disabled: boolean;
  onChange: (value: Personality) => void;
}) {
  const selected = teachers.find((teacher) => teacher.key === value)!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={styles.teacherTrigger}
          disabled={disabled}
          aria-label={`Estilo do professor: ${selected.name}`}
        >
          <span className={styles.teacherPrefix}>Professor</span>
          <span className={styles.teacherName}>{selected.name}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={styles.teacherMenu}
        align="start"
        sideOffset={8}
      >
        <DropdownMenuLabel className={styles.teacherMenuLabel}>
          Como você prefere aprender?
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as Personality)}
        >
          {teachers.map(({ key, name, description, icon: Icon }) => (
            <DropdownMenuRadioItem
              key={key}
              value={key}
              className={styles.teacherOption}
            >
              <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
              <span>
                <strong>{name}</strong>
                <span>{description}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <p className={styles.teacherMenuHint}>
          A mudança vale para as próximas respostas.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
