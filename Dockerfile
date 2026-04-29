# Build: docker build -t vigilancia-backend -f Dockerfile .
# Run:   docker run -p 4001:4001 vigilancia-backend
FROM node:20-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY nest-cli.json tsconfig.json ./
COPY src ./src

RUN pnpm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

EXPOSE 4001
ENV PORT=4001

CMD ["node", "dist/main.js"]
