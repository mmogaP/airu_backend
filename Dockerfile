FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN chmod +x start.sh

EXPOSE 8787

CMD ["sh", "start.sh"]
