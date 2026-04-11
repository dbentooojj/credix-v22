FROM node:20-alpine AS deps

WORKDIR /app
ARG LEGACY_BACKEND_URL=http://backend:4000
ENV LEGACY_BACKEND_URL=$LEGACY_BACKEND_URL

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci --workspace frontend --no-audit --no-fund

FROM node:20-alpine AS builder

WORKDIR /app
ARG LEGACY_BACKEND_URL=http://backend:4000
ENV LEGACY_BACKEND_URL=$LEGACY_BACKEND_URL

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/frontend/package.json ./frontend/package.json
COPY --from=deps /app/backend/package.json ./backend/package.json
COPY frontend ./frontend

RUN npm run build --workspace frontend

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG LEGACY_BACKEND_URL=http://backend:4000
ENV LEGACY_BACKEND_URL=$LEGACY_BACKEND_URL

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci --workspace frontend --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/next.config.mjs ./frontend/next.config.mjs

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "frontend"]
