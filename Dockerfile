FROM node:20.19.0-slim

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install dependencies without cache mount issues
RUN npm ci --no-cache

# Copy all source code
COPY . .

# Build the app
RUN npm run build

# Expose the port Railway assigns
EXPOSE ${PORT:-5000}

# Start the app
CMD ["node", "dist/index.cjs"]
