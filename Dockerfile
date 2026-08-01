# ---------- build ----------
# Node 22: required by @capacitor/cli (mobile tooling in devDependencies).
# The runtime server itself is fine on Node 20+, but keeping one version
# avoids EBADENGINE warnings and lockfile conflicts.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
EXPOSE 3000
# apply schema, then boot
CMD ["sh", "-c", "npx drizzle-kit push --force=false || true; node dist/boot.js"]
