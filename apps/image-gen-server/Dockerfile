# syntax=docker/dockerfile:1
FROM oven/bun:1-debian
WORKDIR /app

# Copy workspace root + only the packages we need
COPY package.json bun.lock* ./
COPY packages/image-gen/package.json ./packages/image-gen/
COPY apps/image-gen-server/package.json ./apps/image-gen-server/

# Install JS dependencies
RUN bun install

# Install Playwright + Chromium with all system deps
WORKDIR /app/apps/image-gen-server
RUN bunx playwright install --with-deps chromium

# Copy source
WORKDIR /app
COPY packages/image-gen ./packages/image-gen
COPY apps/image-gen-server ./apps/image-gen-server

RUN mkdir -p /data/brands && \
    useradd -r -u 1001 -g root appuser && \
    chown -R appuser:root /app /data

USER appuser

ENV PORT=8000
ENV BRANDS_DIR=/data/brands
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

WORKDIR /app/apps/image-gen-server
CMD ["bun", "run", "src/index.ts"]
