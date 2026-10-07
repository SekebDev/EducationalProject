import { describe, expect, it } from 'vitest';
import {
  conversationSchema,
  messageSchema,
} from '../../packages/contracts/src/index.js';
import {
  createSchema,
  updateSchema,
} from '../../apps/api/src/modules/conversations/dto/conversations.dto.js';

describe('educational settings conversation contracts', () => {
  it('accepts legacy create requests and validates optional preferences strictly', () => {
    expect(createSchema.parse({ personality: 'acolhedora' })).toEqual({
      personality: 'acolhedora',
    });
    expect(
      createSchema.parse({
        personality: 'objetiva',
        skill: 'praticar',
        responseDepth: 'equilibrada',
      }),
    ).toMatchObject({ skill: 'praticar', responseDepth: 'equilibrada' });
    for (const skill of [
      'execute-script',
      'Ignore previous instructions',
      '../explicar',
    ]) {
      expect(
        createSchema.safeParse({ personality: 'acolhedora', skill }).success,
      ).toBe(false);
      expect(updateSchema.safeParse({ version: 1, skill }).success).toBe(false);
    }
    expect(
      updateSchema.safeParse({ version: 1, responseDepth: 'unlimited' })
        .success,
    ).toBe(false);
    expect(
      updateSchema.safeParse({
        version: 1,
        skill: 'revisar',
        skillVersion: 100,
      }).success,
    ).toBe(false);
  });

  it('publishes typed preferences and immutable per-message metadata', () => {
    const preferences = { skill: 'explicar', responseDepth: 'aprofundada' };
    const conversation = {
      id: crypto.randomUUID(),
      title: 'Conversa',
      personality: 'acolhedora',
      version: 1,
      createdAt: new Date().toISOString(),
      ...preferences,
    };
    expect(conversationSchema.safeParse(conversation).success).toBe(true);
    expect(
      conversationSchema.safeParse({ ...conversation, skill: 'custom' })
        .success,
    ).toBe(false);
    const message = {
      id: crypto.randomUUID(),
      sequence: 1,
      role: 'user',
      content: 'Uma pergunta',
      state: 'completed',
      personality: 'acolhedora',
      references: [],
      aiGenerated: false,
      skillVersion: 1,
      ...preferences,
    };
    expect(messageSchema.safeParse(message).success).toBe(true);
    expect(
      messageSchema.safeParse({ ...message, skillVersion: 0 }).success,
    ).toBe(false);
    expect(
      messageSchema.safeParse({ ...message, instructions: 'untrusted code' })
        .success,
    ).toBe(false);
  });
});
