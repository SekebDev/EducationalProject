'use client';

import {
  educationalSkills,
  responseDepths,
  type EducationalSkill,
  type ResponseDepth,
} from '@study/contracts';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import styles from './study-skills.module.css';

export const skillNames = Object.fromEntries(
  educationalSkills.map(({ key, name }) => [key, name]),
) as Record<EducationalSkill, string>;

export const depthNames = Object.fromEntries(
  responseDepths.map(({ key, name }) => [key, name]),
) as Record<ResponseDepth, string>;

export function StudySkillControls({
  skill,
  responseDepth,
  disabled,
  onChange,
}: {
  skill: EducationalSkill;
  responseDepth: ResponseDepth;
  disabled: boolean;
  onChange: (preferences: {
    skill?: EducationalSkill;
    responseDepth?: ResponseDepth;
  }) => void;
}) {
  return (
    <div className={styles.controls} role="group" aria-label="Como estudar">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={styles.trigger}
            disabled={disabled}
            aria-label={`Método de estudo: ${skillNames[skill]}`}
          >
            {skillNames[skill]}
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className={styles.menu} align="start">
          <DropdownMenuLabel>Método de estudo</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={skill}
            onValueChange={(value) =>
              onChange({ skill: value as EducationalSkill })
            }
          >
            {educationalSkills.map(({ key, name, description }) => (
              <DropdownMenuRadioItem
                key={key}
                value={key}
                className={styles.option}
              >
                <span>
                  <strong>{name}</strong>
                  <span>{description}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <p className={styles.hint}>Vale para as próximas respostas.</p>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={styles.trigger}
            disabled={disabled}
            aria-label={`Profundidade: ${depthNames[responseDepth]}`}
          >
            {depthNames[responseDepth]}
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className={styles.menu} align="end">
          <DropdownMenuLabel>Profundidade da resposta</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={responseDepth}
            onValueChange={(value) =>
              onChange({ responseDepth: value as ResponseDepth })
            }
          >
            {responseDepths.map(({ key, name, description }) => (
              <DropdownMenuRadioItem
                key={key}
                value={key}
                className={styles.option}
              >
                <span>
                  <strong>{name}</strong>
                  <span>{description}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <p className={styles.hint}>O estilo do professor continua o mesmo.</p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
