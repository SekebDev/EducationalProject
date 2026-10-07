// Tests never inherit paid-provider credentials from a developer's .env.
// Provider tests inject a mock SDK and explicit fixture credentials instead.
process.env.AI_PROVIDER = 'fake';
delete process.env.OPENAI_API_KEY;
