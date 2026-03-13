FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache — only re-runs when package files change)
COPY package*.json ./
# npm install (not ci) because there is no committed package-lock.json yet.
# The lock file will be generated inside the container and stored in the
# /app/node_modules volume, so subsequent builds are still fast.
RUN npm install

# Copy source (overwritten by volume mount in development)
COPY . .

EXPOSE 3000

# Development server with hot reload
CMD ["npm", "run", "dev"]
