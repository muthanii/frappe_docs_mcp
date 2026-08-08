# Build stage: needs devDependencies (TypeScript) to compile.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage: production dependencies plus the compiled output only.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node

# Speaks MCP over stdio. Run attached so a client owns stdin/stdout.
CMD ["node", "dist/server.js"]
