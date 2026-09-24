# Sync relay only — for Railway / Fly / any container host
FROM node:20-alpine
WORKDIR /app
COPY sync-relay/server.mjs ./server.mjs
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
