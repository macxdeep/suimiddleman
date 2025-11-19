# Use Node.js 20 LTS as base image
FROM node:20

# Install curl (required for suiup installation)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install suiup and set up environment
RUN curl -sSfL https://raw.githubusercontent.com/Mystenlabs/suiup/main/install.sh | sh && \
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc

# Add Sui binaries to PATH for all sessions
ENV PATH="/root/.local/bin:${PATH}"

# Install Sui CLI (testnet version)
RUN /bin/bash -c "export PATH=\"$HOME/.local/bin:$PATH\" && suiup install sui@testnet"

# Create symlink to make sui available at /usr/local/bin/sui (commonly expected location)
RUN ln -s /root/.local/bin/sui /usr/local/bin/sui

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

