# syntax=docker/dockerfile:1.7
# MinIO topluluk sürümünün resmi imajları artık herkese açık registry'lerde yok (Docker Hub ve
# quay.io anonim çekmeye kapalı, 2026-10 itibarıyla); AGPL kaynak koddan sabit sürüm derlenir.
# Son topluluk sürümü RELEASE.2025-10-15T17-29-55Z. Uygulama S3 API kullandığı için depo
# gerektiğinde S3 uyumlu başka bir sunucuyla değiştirilebilir (bkz. .claude/backend.md § 7).
FROM golang:1.24-alpine AS build
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch "${MINIO_RELEASE}" https://github.com/minio/minio.git .
RUN --mount=type=cache,target=/root/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -tags kqueue \
      -ldflags "-s -w -X github.com/minio/minio/cmd.Version=${MINIO_RELEASE#RELEASE.} -X github.com/minio/minio/cmd.ReleaseTag=${MINIO_RELEASE}" \
      -o /out/minio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/minio /usr/bin/minio
ENV MINIO_CONFIG_ENV_FILE=/etc/minio/config.env
EXPOSE 9000 9001
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9000/minio/health/live >/dev/null || exit 1
ENTRYPOINT ["/usr/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]
