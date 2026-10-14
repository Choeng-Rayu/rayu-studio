interface Env {
  // Hosted infrastructure is explicitly allowlisted in scripts/runtime-bindings.mjs.
  // Provider credential fields below remain for the shared Electron adapters only;
  // they are not forwarded to the hosted worker or used as hosted fallback keys.
  RUNNING_IN_DOCKER: Settings;
  DEFAULT_NUM_CTX: Settings;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  GROQ_API_KEY: string;
  HuggingFace_API_KEY: string;
  OPEN_ROUTER_API_KEY: string;
  OLLAMA_API_BASE_URL: string;
  OPENAI_LIKE_API_KEY: string;
  OPENAI_LIKE_API_BASE_URL: string;
  OPENAI_LIKE_API_MODELS: string;
  TOGETHER_API_KEY: string;
  TOGETHER_API_BASE_URL: string;
  DEEPSEEK_API_KEY: string;
  LMSTUDIO_API_BASE_URL: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  MISTRAL_API_KEY: string;
  XAI_API_KEY: string;
  PERPLEXITY_API_KEY: string;
  AWS_BEDROCK_CONFIG: string;
  RAYU_BACKEND_URL: string;
  RAYU_STUDIO_SERVER_SECRET: string;
  VITE_RAYU_BACKEND_URL: string;
  RAYU_GATEWAY_URL: string;
  RAYU_STUDIO_AUTH_BRIDGE_URL: string;
  // Legacy desktop starter-template credential; not a shared hosted token.
  GITHUB_TOKEN: string;
}
