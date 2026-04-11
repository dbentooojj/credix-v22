FROM node:20-alpine AS deps

WORKDIR /app
ARG LEGACY_BACKEND_URL=http://backend:4000
ENV LEGACY_BACKEND_URL=$LEGACY_BACKEND_URL

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS builder

WORKDIR /app
ARG LEGACY_BACKEND_URL=http://backend:4000
ENV LEGACY_BACKEND_URL=$LEGACY_BACKEND_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG LEGACY_BACKEND_URL=http://backend:4000
ENV LEGACY_BACKEND_URL=$LEGACY_BACKEND_URL

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000

CMD ["npm", "run", "start"]
