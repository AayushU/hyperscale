FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY server ./server
COPY public ./public
COPY RULES.md CARDS.md PLAYTEST.md ./
ENV PORT=3000 DATA_DIR=/data NODE_ENV=production
VOLUME /data
EXPOSE 3000
CMD ["node", "server/server.js"]
