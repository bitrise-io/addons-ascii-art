FROM node:12.21.0-alpine

RUN yarn install

ADD out/ .
ADD node_modules node_modules

CMD [ "node", "app.js" ]