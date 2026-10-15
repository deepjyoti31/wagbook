# Wagbook as a container, for running on your own server (docs/14-self-hosting.md).
# The NEXT_PUBLIC_ values are built into the app, so they are build arguments:
# change one, build again.
#
#   docker build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://api.book.example.in \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://book.example.in \
#     -t wagbook .
#
# deploy/compose.yml does this for you.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Browsers for the end-to-end tests are not needed in the image.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Behind a network that inspects HTTPS, pass its certificate bundle:
#   docker build --secret id=ca,src=/path/to/ca-bundle.crt ...
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export npm_config_cafile=/run/secrets/ca; fi; \
    npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_WAGBOOK_DEMO=""
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_WAGBOOK_DEMO=$NEXT_PUBLIC_WAGBOOK_DEMO \
    WAGBOOK_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN npx next build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S wagbook && adduser -S wagbook -G wagbook
COPY --from=build --chown=wagbook:wagbook /app/.next/standalone ./
COPY --from=build --chown=wagbook:wagbook /app/.next/static ./.next/static
COPY --from=build --chown=wagbook:wagbook /app/public ./public
USER wagbook
EXPOSE 3000
CMD ["node", "server.js"]
