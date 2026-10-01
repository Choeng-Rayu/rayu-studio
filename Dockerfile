# ---- build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# CI-friendly env
ENV HUSKY=0
ENV CI=true

# Use pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Ensure git is available for build and runtime scripts
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

# Accept (optional) build-time public URL for Remix/Vite (Coolify can pass it)
ARG VITE_PUBLIC_APP_URL
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}

# Browser-side Rayu backend URL (Web Bridge socket on /remote). Vite inlines VITE_*
# values at build time, and .env files are not in the build context, so a Coolify
# "build variable" only reaches `pnpm run build` if it is declared here. Empty keeps
# the default (https://api.rayucode.com/api).
ARG VITE_RAYU_BACKEND_URL
ENV VITE_RAYU_BACKEND_URL=${VITE_RAYU_BACKEND_URL}

# Install deps efficiently
COPY package.json pnpm-lock.yaml* ./
RUN pnpm fetch

# Copy source and build
COPY . .
# install with dev deps (needed to build)
RUN pnpm install --offline --frozen-lockfile

# Build the Remix app (SSR + client)
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm run build

# ---- production dependencies stage ----
FROM build AS prod-deps

# Keep only production deps for runtime
RUN pnpm prune --prod --ignore-scripts


# ---- development stage ----
FROM build AS development

# Non-sensitive development arguments
ARG VITE_LOG_LEVEL=debug
ARG DEFAULT_NUM_CTX

# Set non-sensitive environment variables for development
ENV VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    DEFAULT_NUM_CTX=${DEFAULT_NUM_CTX} \
    RUNNING_IN_DOCKER=true

# Note: API keys should be provided at runtime via docker run -e or docker-compose
# Example: docker run -e OPENAI_API_KEY=your_key_here ...

RUN mkdir -p /app/run
CMD ["pnpm", "run", "dev", "--host"]


# ---- production stage ----
FROM prod-deps AS rayu-ai-production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173
ENV HOST=0.0.0.0

# Non-sensitive build arguments
ARG VITE_LOG_LEVEL=debug
ARG DEFAULT_NUM_CTX

# Set non-sensitive environment variables
ENV WRANGLER_SEND_METRICS=false \
    VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    DEFAULT_NUM_CTX=${DEFAULT_NUM_CTX} \
    RUNNING_IN_DOCKER=true

# Note: API keys should be provided at runtime via docker run -e or docker-compose
# Example: docker run -e OPENAI_API_KEY=your_key_here ...

# Install curl for healthchecks, plus the system CA store. The slim base image
# ships none, and workerd (unlike Node, which bundles its own CAs) verifies TLS
# against /etc/ssl/certs: without it every outbound HTTPS fetch from the server
# (Rayu auth + gateway, Netlify/Vercel deploys, GitHub templates) fails with
# "TLS peer's certificate is not trusted".
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy built files and scripts
COPY --from=prod-deps /app/build /app/build
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/package.json /app/package.json
COPY --from=prod-deps /app/bindings.sh /app/bindings.sh

# Pre-configure wrangler to disable metrics
RUN mkdir -p /root/.config/.wrangler && \
    echo '{"enabled":false}' > /root/.config/.wrangler/metrics.json

# Make bindings script executable
RUN chmod +x /app/bindings.sh

EXPOSE 5173

# Healthcheck for deployment platforms (Coolify reads this).
# - /api/health goes through the same Remix server bundle as every page, so a
#   bundle that cannot load still fails, without paying for a full SSR render
#   every interval.
# - `wrangler pages dev` bundles functions/ at boot, which took ~30-40s on the
#   Coolify server; with a 5s start period most retries were spent before the
#   server was even listening.
# - 127.0.0.1, not localhost: wrangler binds IPv4 only.
HEALTHCHECK --interval=10s --timeout=10s --start-period=30s --retries=10 \
  CMD curl -fsS http://127.0.0.1:5173/api/health || exit 1

# Start using dockerstart script with Wrangler
CMD ["pnpm", "run", "dockerstart"]
