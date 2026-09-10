# server/Dockerfile
FROM node:24-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Copy application code
COPY . .

EXPOSE 8000

CMD ["npm", "start"]