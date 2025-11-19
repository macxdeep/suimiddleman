# Use Mysten Sui Tools Docker image as base for Sui CLI
FROM mysten/sui-tools:compat-arm64 AS sui-tools

# Use Node.js 20 LTS as base image
FROM node:20

# Install curl (required for suiup installation) - keeping for potential fallback
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy Sui tools from the sui-tools image
COPY --from=sui-tools /usr/local/bin/sui /usr/local/bin/sui
COPY --from=sui-tools /usr/local/bin/sui-bridge /usr/local/bin/sui-bridge
COPY --from=sui-tools /usr/local/bin/sui-bridge-cli /usr/local/bin/sui-bridge-cli
COPY --from=sui-tools /usr/local/bin/sui-cluster-test /usr/local/bin/sui-cluster-test
COPY --from=sui-tools /usr/local/bin/sui-faucet /usr/local/bin/sui-faucet
COPY --from=sui-tools /usr/local/bin/sui-tool /usr/local/bin/sui-tool

# Verify sui installation
RUN sui --version

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Expose port 3000 (default, can be overridden via PORT env var)
EXPOSE 3000

# Run the application with ts-node-dev
CMD ["pnpm", "run", "dev"]