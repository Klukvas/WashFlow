# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
RUN pnpm build
# Compile seed script (nest build only compiles src/)
RUN npx tsc prisma/seed.ts --outDir dist --rootDir . --module nodenext --moduleResolution nodenext --target ES2023 --esModuleInterop --skipLibCheck

# Stage 2: Production
FROM node:20-alpine AS production

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# Generate Prisma client against production node_modules
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

RUN mkdir -p /app/uploads/vehicles && chown -R app:app /app
USER app

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
