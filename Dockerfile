# ------------------------------------------------------------
# Base image: Ubuntu 24.04 (GLIBC >= 2.38 → Sui compatible)
# ------------------------------------------------------------
FROM ubuntu:24.04

# ------------------------------------------------------------
# Install system dependencies
# ------------------------------------------------------------
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    bash \
    git \
    tar \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------
# Install Node 20 (official binaries)
# Multi-architecture compatible (amd64 & arm64)
# ------------------------------------------------------------
RUN curl -fsSL "https://nodejs.org/dist/v20.11.1/node-v20.11.1-linux-$(dpkg --print-architecture).tar.xz" \
    -o /tmp/node.tar.xz \
    && mkdir -p /usr/local/lib/nodejs \
    && tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs \
    && rm /tmp/node.tar.xz

# ------------------------------------------------------------
# Symlink node/npm/npx so they're available globally
# ------------------------------------------------------------
RUN ln -s /usr/local/lib/nodejs/node-*/bin/node /usr/local/bin/node || true \
 && ln -s /usr/local/lib/nodejs/node-*/bin/npm /usr/local/bin/npm || true \
 && ln -s /usr/local/lib/nodejs/node-*/bin/npx /usr/local/bin/npx || true

# ------------------------------------------------------------
# Install pnpm + symlink it
# ------------------------------------------------------------
RUN npm install -g pnpm \
 && ln -s /usr/local/lib/nodejs/node-*/bin/pnpm /usr/local/bin/pnpm || true

# Verify node tools
RUN node -v && npm -v && pnpm -v

# ------------------------------------------------------------
# Install suiup (Sui installer)
# ------------------------------------------------------------
RUN curl -sSfL https://raw.githubusercontent.com/MystenLabs/suiup/main/install.sh | sh

# Add suiup bin directory to PATH
ENV PATH="/root/.local/bin:${PATH}"

# ------------------------------------------------------------
# Install Sui (testnet) and set default binary
# ------------------------------------------------------------
RUN suiup install sui@testnet \
 && suiup default set sui@testnet

# Verify Sui installation
RUN sui --version

# ------------------------------------------------------------
# Setup app
# ------------------------------------------------------------
WORKDIR /app

# Copy dependency files first (cache layer)
COPY pnpm-lock.yaml package.json ./

RUN pnpm install

# Copy the rest of your app
COPY . .

# Expose backend port
EXPOSE 3000

# ------------------------------------------------------------
# Run dev server (ts-node-dev)
# ------------------------------------------------------------
CMD ["pnpm", "dev"]
