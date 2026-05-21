# Multi-stage build for the NestJS API + worker — both run from this image,
# compose decides the command.

# deps
FROM node:24-alpine AS deps
# Prisma needs openssl present to pick the correct query-engine binary.
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# build
FROM node:24-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# runtime
FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

# Copy compiled output
COPY --from=build /app/dist ./dist

# Uploads dir (mounted as volume in compose)
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
