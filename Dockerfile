# Build stage: needs devDependencies (TypeScript) to compile.
FROM node:20-alpine AS build
WORKDIR /app

# npm ci installs exactly what package-lock.json pins, so image builds are
# reproducible and fail loudly if the lockfile and manifest disagree.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
# Uses tsconfig.build.json, which excludes *.test.ts from the emitted output.
RUN npm run build

# Runtime stage: production dependencies plus the compiled output only.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node

# Speaks MCP over stdio. Run attached so a client owns stdin/stdout.
CMD ["node", "dist/server.js"]
