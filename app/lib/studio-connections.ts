// Names match the existing adapters. Repository GitHub is deliberately separate.
export const AI_CONNECTIONS: Record<string, string> = {
  Anthropic: 'ai:anthropic',
  Cerebras: 'ai:cerebras',
  Cohere: 'ai:cohere',
  Deepseek: 'ai:deepseek',
  Fireworks: 'ai:fireworks',
  Google: 'ai:google',
  Groq: 'ai:groq',
  HuggingFace: 'ai:huggingface',
  Mistral: 'ai:mistral',
  OpenRouter: 'ai:openrouter',
  OpenAILike: 'ai:openai-like',
  OpenAI: 'ai:openai',
  Perplexity: 'ai:perplexity',
  Together: 'ai:together',
  xAI: 'ai:xai',
  Hyperbolic: 'ai:hyperbolic',
  AmazonBedrock: 'ai:amazonbedrock',
  Github: 'ai:github-models',
  Moonshot: 'ai:moonshot',
  'Z.ai': 'ai:zai',
  'Rayu API Key': 'ai:rayu-api-key',
};
export const SERVICE_CONNECTIONS = ['github', 'gitlab', 'netlify', 'vercel', 'supabase', 'cloudflare'] as const;
export const CONNECTION_KINDS = [...SERVICE_CONNECTIONS, ...Object.values(AI_CONNECTIONS)];
export const isStudioDesktop = () => typeof __STUDIO_DESKTOP__ !== 'undefined' && __STUDIO_DESKTOP__;
