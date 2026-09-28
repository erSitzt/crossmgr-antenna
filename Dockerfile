# Stage 1: build the web app
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci || npm install
COPY web/ ./
RUN npm run build

# Stage 2: Python live bridge, serves the built web app
FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server/ server/
COPY --from=web /app/web/dist web/dist
ENV HOST=0.0.0.0 PORT=18787
EXPOSE 18787
WORKDIR /app/server
CMD ["python", "app.py"]
