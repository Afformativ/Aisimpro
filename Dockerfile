FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY contracts/ ./contracts/
# Compiled circuits and the demo claims are read at runtime (zk/ptau is build-only)
COPY zk/artifacts/ ./zk/artifacts/
COPY zk/demo/ ./zk/demo/

# Create data directory for persistence
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Expose port
EXPOSE 3000

# Start the API server
CMD ["node", "src/api.js"]
