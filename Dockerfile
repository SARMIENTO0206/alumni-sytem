FROM node:22.14-bookworm-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY . .
WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
