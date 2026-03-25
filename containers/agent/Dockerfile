# Agent container for running coding agents
# Base: Node.js 22 + Git
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Working directory for repo clones
WORKDIR /workspace

# Copy entrypoint and task runner
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY package.json /agent/package.json
COPY src/ /agent/src/

WORKDIR /agent
RUN npm install --production

RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
