FROM node:16
RUN apt update
RUN apt-get install --no-install-recommends --assume-yes wine
RUN dpkg --add-architecture i386
RUN apt update
RUN apt install --no-install-recommends --assume-yes wine32
RUN apt-get install wine wine32
ENV DISPLAY :0

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

ADD . /usr/src/app

RUN npm run build-ts

RUN npm prune --production

CMD ["node", "dist/index.js"]