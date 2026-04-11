FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace backend --no-audit --no-fund && npm cache clean --force

FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/backend/package.json ./backend/package.json
COPY --from=deps /app/frontend/package.json ./frontend/package.json
COPY backend/prisma ./backend/prisma
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src

RUN npm run prisma:generate --workspace backend
RUN npm run build --workspace backend

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/src/public ./backend/src/public

EXPOSE 4000

CMD ["sh", "-c", "npm run prisma:migrate:deploy --workspace backend && node backend/dist/server.js"]
