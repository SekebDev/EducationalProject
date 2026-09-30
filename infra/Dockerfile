# syntax=docker/dockerfile:1
FROM node:24.15.0-bookworm-slim AS dependencies
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
# These are the native dependencies used by the API and Next.js. The trust
# allowance exists only inside this build, never in the user's workspace.
RUN <<'SHELL'
printf '\nonlyBuiltDependencies:\n  - argon2\n  - sharp\n  - "@swc/core"\n' >> pnpm-workspace.yaml
pnpm install --frozen-lockfile
SHELL

FROM dependencies AS build
COPY . .
# Next.js embeds rewrites at build time. This is a Docker network address,
# never a public browser URL or a secret.
ENV API_INTERNAL_ORIGIN=http://api:3001
ENV NEXT_TELEMETRY_DISABLED=1
# The shared package exposes TypeScript to local development tools. Compiled
# containers need JavaScript exports, including its relative .js imports.
RUN <<'SHELL'
pnpm exec tsc -p packages/contracts/tsconfig.json --noEmit false --declaration --rootDir packages/contracts/src --outDir packages/contracts/dist
node --input-type=module -e 'import fs from "node:fs"; const path="packages/contracts/package.json"; const pkg=JSON.parse(fs.readFileSync(path,"utf8")); pkg.exports=Object.fromEntries(Object.entries(pkg.exports).map(([key,value])=>[key,value.replace("./src/","./dist/").replace(/\.ts$/,".js")])); fs.writeFileSync(path,JSON.stringify(pkg,null,2));'
SHELL
RUN pnpm --filter @study/api build
RUN pnpm --filter @study/web build

FROM dependencies AS runtime
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/storage && chown node:node /app/storage
ENV NEXT_TELEMETRY_DISABLED=1
USER node
EXPOSE 3000 3001
WORKDIR /app/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
