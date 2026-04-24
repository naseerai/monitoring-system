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

# Copy only needed files
COPY package*.json ./

RUN npm install --production

# Copy backend + built frontend
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/node_modules ./node_modules

# Expose backend port
EXPOSE 3000

# Run server
CMD ["npx", "tsx", "server.ts"]