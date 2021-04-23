FROM node:12.21.0-alpine

COPY src src
COPY package.json yarn.lock tsconfig.json ./

RUN yarn install --production=true

CMD [ "node", "out/app.js" ]