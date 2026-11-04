# Imagen del servidor. Despliegue: SIN PROBAR (no es requisito del hackathon).
# Migrar la base antes de arrancar: npx prisma migrate deploy
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY prisma ./prisma
RUN npm ci
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY data ./data
# Cloud Run inyecta PORT; config.ts lo lee.
EXPOSE 8080
CMD ["node", "dist/src/index.js"]
