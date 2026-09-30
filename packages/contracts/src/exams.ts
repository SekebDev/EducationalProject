import { questionPublicSchema } from './index.js';
export { questionPublicSchema };
export type { QuestionPublic } from './index.js';

export function toQuestionPublic(value: unknown) {
  return questionPublicSchema.parse(value);
}
