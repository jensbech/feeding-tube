FROM rust:1-bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release --features web

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 ca-certificates curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && apt-get remove -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/feeding-tube /usr/local/bin/

RUN mkdir -p /data/.feeding-tube
ENV HOME=/data

EXPOSE 8080
VOLUME ["/data/.feeding-tube"]

CMD ["feeding-tube", "--web", "--port", "8080"]
