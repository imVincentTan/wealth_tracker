FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3847
ENV PORT=3847
CMD ["npm", "run", "dev"]
