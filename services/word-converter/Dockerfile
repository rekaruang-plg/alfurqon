FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 libreoffice-writer fonts-dejavu fonts-noto-core && rm -rf /var/lib/apt/lists/* && useradd -m converter
WORKDIR /app
COPY server.py /app/server.py
USER converter
ENV HOME=/tmp
EXPOSE 8080
CMD ["python3", "/app/server.py"]
