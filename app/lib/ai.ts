import { createOpenAI } from '@ai-sdk/openai';

// Configure AI provider and model via environment variables:
//   AI_PROVIDER — openai (default) | anthropic | google
//   AI_MODEL    — any model string for the chosen provider (default: gpt-4o-mini)
//
// To add a provider, install the package and add a case below:
//   Anthropic: npm install @ai-sdk/anthropic
//   Google:    npm install @ai-sdk/google

const modelId = process.env.AI_MODEL ?? 'gpt-4o-mini';

const openAIClient = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export function getAIModel() {
    const provider = process.env.AI_PROVIDER ?? 'openai';

    switch (provider) {
        case 'openai':
        default:
            return openAIClient(modelId);
    }
}
