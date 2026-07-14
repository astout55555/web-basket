# ---------- Stage 1: build everything ----------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

# Install with only the manifests first: this layer is cached until a
# package.json or the lockfile changes, so code edits don't re-install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---------- Stage 2: production runtime ----------
FROM node:22-alpine
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production

# Server runtime dependencies only (dev deps and other packages excluded),
# still pinned by the same lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# Cache cleanup must happen in the SAME layer as the install — layers are
# immutable, so a later rm cannot shrink an earlier one.
RUN pnpm install --frozen-lockfile --prod --filter @web-basket/server \
  && rm -rf /root/.cache /root/.local/share/pnpm

# Build artifacts: the bundled server, its migrations, and the SPA build.
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/migrations apps/server/migrations
COPY --from=build /app/apps/web/dist apps/web/dist

# Never run as root inside the container.
USER node
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["node", "dist/server.js"]
