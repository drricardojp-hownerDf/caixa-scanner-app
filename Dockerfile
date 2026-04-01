FROM node:20.19.0-bookworm AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy all source code
COPY . .

# Set production env and build
ENV NODE_ENV=production
RUN npm run build

# --- Production stage ---
FROM node:20.19.0-bookworm-slim

WORKDIR /app

# Copy built output and node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production

# Railway assigns PORT dynamically
EXPOSE ${PORT:-5000}

CMD ["node", "dist/index.cjs"]
