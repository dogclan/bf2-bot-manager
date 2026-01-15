FROM node:24.13.0-bullseye AS base

FROM base AS build

WORKDIR /app

COPY . .

RUN npm ci

RUN npm run build

FROM base AS app

WORKDIR /app

ENV DISPLAY :0

RUN apt update
RUN apt install --no-install-recommends --assume-yes wine
RUN dpkg --add-architecture i386
RUN apt update
RUN apt install --no-install-recommends --assume-yes wine32

COPY package*.json .

RUN npm ci --omit dev

COPY --from=build /app/dist/ .

COPY config.schema.json .

COPY wait-for-it.sh .
RUN chmod +x wait-for-it.sh

ENV ROOT_DIR=/app

CMD ["node", "index.js"]
