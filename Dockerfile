# Next.js UI (Tally). The browser talks to the API at http://127.0.0.1:8000
# (published by docker compose), baked in at build time below. Without it the
# bundle calls relative /api paths, which only works when FastAPI serves the UI.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 43127
# package.json's start script pins --hostname 127.0.0.1, which is unreachable
# from the host inside a container, so bind explicitly here.
CMD ["npx", "next", "start", "--port", "43127", "--hostname", "0.0.0.0"]
