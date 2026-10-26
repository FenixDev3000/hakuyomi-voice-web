FROM node:20-alpine

WORKDIR /app

# Ejecutar bajo el usuario sin privilegios 'node' (UID 1000) incluido en node:alpine
COPY --chown=node:node package.json ./
RUN npm install && npm cache clean --force

COPY --chown=node:node . .
RUN chown -R node:node /app

USER node

EXPOSE 5173

CMD ["npm", "run", "dev"]
