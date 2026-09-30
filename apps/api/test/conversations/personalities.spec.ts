import { describe, expect, it } from 'vitest';
import {
  personalities,
  PERSONALITY_CATALOG_VERSION,
  personalityStyleAtVersion,
} from '../../src/modules/conversations/personalities.js';

describe('personality catalog', () => {
  it('publishes the three stable styles under an explicit catalog version', () => {
    expect(PERSONALITY_CATALOG_VERSION).toBe(1);
    expect(Object.keys(personalities)).toEqual([
      'acolhedora',
      'objetiva',
      'socratica',
    ]);
    for (const [key, personality] of Object.entries(personalities)) {
      expect(personality.key).toBe(key);
      expect(personality.name).not.toBe('');
      expect(personality.description).not.toBe('');
      expect(personality.style).not.toBe('');
      expect(personality.style).not.toMatch(/nota|gabarito|rubrica/iu);
    }
    expect(personalityStyleAtVersion('socratica', 1)).toBe(
      personalities.socratica.style,
    );
    expect(() => personalityStyleAtVersion('socratica', 2)).toThrow(
      'PERSONALITY_VERSION_UNAVAILABLE',
    );
  });
});
