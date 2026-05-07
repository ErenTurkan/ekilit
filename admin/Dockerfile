FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Set API URL for build time
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# Use serve for static output
RUN npm install -g serve

EXPOSE 3001

CMD ["serve", "-s", "out", "-p", "3001"]
