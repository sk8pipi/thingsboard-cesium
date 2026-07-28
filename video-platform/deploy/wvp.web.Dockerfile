FROM node:18-bookworm-slim AS builder

WORKDIR /build/web

COPY source/wvp-GB28181-pro/web/ ./

RUN --mount=type=cache,target=/root/.npm npm install --legacy-peer-deps --registry=https://registry.npmmirror.com

ENV NODE_OPTIONS=--openssl-legacy-provider
RUN npm run build:prod

FROM nginx:alpine

COPY --from=builder /build/src/main/resources/static /opt/dist

CMD ["nginx", "-g", "daemon off;"]
