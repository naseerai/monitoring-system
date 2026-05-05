# ---------- Stage 1: Build frontend ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files (FIXED)
COPY . .

# Build frontend
RUN npm run build


# ---------- Stage 2: Run backend ----------
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy backend files
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src

# Copy node_modules (optional but okay)
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]