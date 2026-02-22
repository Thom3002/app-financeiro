FROM node:20-alpine

RUN apk add --no-cache python3 make g++ gcc

WORKDIR /app

COPY package*.json ./
RUN npm install --build-from-source

COPY . .

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["npm", "run", "start:dev"]
