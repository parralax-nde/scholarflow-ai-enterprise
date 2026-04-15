FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --ignore-scripts

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
COPY --from=builder /app .
EXPOSE 80
CMD ["npm", "run", "start", "--", "-p", "80"]
