FROM node:16.18.1
RUN apt update
RUN apt-get install --no-install-recommends --assume-yes wine
RUN dpkg --add-architecture i386
RUN apt update
RUN apt install --no-install-recommends --assume-yes wine32
ENV DISPLAY :0

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

ADD . /usr/src/app

RUN npm run build-ts

RUN npm prune --production

COPY wait-for-it.sh wait-for-it.sh
RUN chmod +x wait-for-it.sh

CMD ["node", "dist/index.js"]
