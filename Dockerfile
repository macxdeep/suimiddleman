# ------------------------------------------------------------
# Base image: Ubuntu 24.04 (GLIBC ≥ 2.38 → Sui compatible)
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
# Install Node 20 — correct arch mapping for Mac (arm64) + Linux (amd64)
# ------------------------------------------------------------
ARG ARCH
RUN ARCH=$(dpkg --print-architecture) \
 && if [ "$ARCH" = "amd64" ]; then NODE_ARCH="x64"; \
    elif [ "$ARCH" = "arm64" ]; then NODE_ARCH="arm64"; \
    else echo "Unsupported architecture: $ARCH" && exit 1; fi \
 && curl -fsSL "https://nodejs.org/dist/v20.11.1/node-v20.11.1-linux-${NODE_ARCH}.tar.xz" \
        -o /tmp/node.tar.xz \
 && mkdir -p /usr/local/lib/nodejs \
 && tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs \
 && rm /tmp/node.tar.xz

# Symlink node/npm/npx
RUN ln -s /usr/local/lib/nodejs/node-*/bin/node /usr/local/bin/node || true \
 && ln -s /usr/local/lib/nodejs/node-*/bin/npm /usr/local/bin/npm || true \
 && ln -s /usr/local/lib/nodejs/node-*/bin/npx /usr/local/bin/npx || true

# ------------------------------------------------------------
# Install pnpm + symlink
# ------------------------------------------------------------
RUN npm install -g pnpm \
 && ln -s /usr/local/lib/nodejs/node-*/bin/pnpm /usr/local/bin/pnpm || true

# Verify
RUN node -v && npm -v && pnpm -v

# ------------------------------------------------------------
# Install suiup + Sui CLI
# ------------------------------------------------------------
RUN curl -sSfL https://raw.githubusercontent.com/MystenLabs/suiup/main/install.sh | sh

# Add suiup bin to PATH
ENV PATH="/root/.local/bin:${PATH}"

RUN suiup install sui@testnet \
 && suiup default set sui@testnet

RUN sui --version

# Symlink so sui is available globally
RUN ln -s /root/.local/bin/sui /usr/local/bin/sui

# ------------------------------------------------------------
# Initialize Sui client non-interactively (auto-generate keys + config)
# ------------------------------------------------------------
RUN mkdir -p /root/.sui/sui_config

# Provide answers:
# 1. y  → create new config
# 2. "" → blank fullnode URL (defaults to testnet)
# 3. 0  → Ed25519 key scheme
RUN printf "y\n\n0\n" | sui client active-address || true

# Optional: print the generated address during build
RUN sui client active-address

# ------------------------------------------------------------
# App setup
# ------------------------------------------------------------
WORKDIR /app

COPY pnpm-lock.yaml package.json ./

# Install ALL deps (including dev)
RUN pnpm install

COPY . .

EXPOSE 3000

# ------------------------------------------------------------
# Run dev server
# ------------------------------------------------------------
CMD ["pnpm", "dev"]
