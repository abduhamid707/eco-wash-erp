FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY . .
RUN pnpm install --no-frozen-lockfile && pnpm --filter @eco/api db:generate && pnpm --filter @eco/api build
USER node
EXPOSE 4000
CMD ["pnpm","--filter","@eco/api","start"]
