FROM node:22-alpine

WORKDIR /app

COPY package*.json /app/
COPY node_modules /app/node_modules/
COPY dist /app/dist/

EXPOSE 1337
CMD ["npm", "run", "start"]
