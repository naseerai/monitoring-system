# ---------- Stage 1: Build frontend ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Build frontend
RUN npm run build


# ---------- Stage 2: Run backend ----------
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps
COPY package*.json ./
RUN npm install --production

# Copy the built frontend bundle
COPY --from=builder /app/dist ./dist

# Copy the backend entry-point and ALL source files it imports at runtime
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src

# Reuse the already-installed node_modules from Stage 1
COPY --from=builder /app/node_modules ./node_modules

# Expose backend port
EXPOSE 3000

# tsx resolves TypeScript imports natively — no compile step needed
CMD ["npx", "tsx", "server.ts"]