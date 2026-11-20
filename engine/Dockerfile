# Moteur Pilepoil, image de production.
FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/data

WORKDIR /app

# Dépendances d'abord (couche mise en cache), sans scripts d'installation.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src
COPY tsconfig.json ./

# Dossier des données apprises (historique des retards, référentiel des lignes).
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

# Jamais en root.
USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/health || exit 1

CMD ["node", "--import", "tsx", "src/server.ts"]
