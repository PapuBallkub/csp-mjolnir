# server/Dockerfile
FROM node:24-alpine

# Production unless something says otherwise, so a deploy that forgets to set
# it fails safe: Secure cookies, HSTS, generic 5xx messages, no index builds at
# boot, and only reviewed summaries scored 80 or more (NFR-17). Compose's
# `environment:` and `env_file:` both override this; the development stack
# sets it back in docker-compose.override.yml.
ENV NODE_ENV=production

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Copy application code
COPY . .

EXPOSE 8000

CMD ["npm", "start"]