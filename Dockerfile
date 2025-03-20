FROM node:18-alpine

WORKDIR /backend

RUN apk add --no-cache openssl

COPY package.json ./

RUN npm install --only=production --omit=dev

COPY . .

RUN mkdir -p ./keys && \
    apk add --no-cache openssh && \
    ssh-keygen -t rsa -b 4096 -m PEM -f ./keys/private.key -N "" && \
    openssl rsa -in ./keys/private.key -pubout -out ./keys/public.key

RUN apk --no-cache add curl

EXPOSE 5000

CMD ["npm", "start"]
