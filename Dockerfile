FROM node:18.13.0
RUN apt update
RUN apt install --no-install-recommends --assume-yes wine
RUN dpkg --add-architecture i386
RUN apt update
RUN apt install --no-install-recommends --assume-yes wine32
ENV DISPLAY :0

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install -g npm@latest --update-notifier=false

RUN npm install --update-notifier=false

ADD . /usr/src/app

RUN npm run build-ts

RUN npm prune --omit=dev

COPY wait-for-it.sh wait-for-it.sh
RUN chmod +x wait-for-it.sh

CMD ["node", "dist/index.js"]
