FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=8787

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY server.js ./

EXPOSE 8787

CMD ["node", "server.js"]
