# Debian-based rather than Alpine: asyncpg and friends ship manylinux wheels, so
# there is nothing to compile here.
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project


FROM python:3.12-slim AS runner

# DejaVu is what the OG image renderer draws with. The Node original asks for
# "Arial", which no Linux container has either, so both sides fall back to a
# substitute — this just makes the substitute explicit and stable.
RUN apt-get update  && apt-get install -y --no-install-recommends fonts-dejavu-core  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PORT=8000

COPY --from=builder /app/.venv /app/.venv
COPY app ./app
# The OG renderer looks for /app/assets/meta-logo-white.png. Without this the
# image still renders, just silently without the logo — backend/Dockerfile has
# always copied it and this was the one place the port forgot.
COPY assets ./assets

RUN useradd --create-home --uid 10001 app && chown -R app:app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
