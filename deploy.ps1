# Script di deploy automatico per Beybladexmeta-Analytics
# Esegue build, cleanup del vecchio container e avvio del nuovo

$ErrorActionPreference = "Stop"

$CONTAINER_NAME = "beybladexmeta-analytics12"
$IMAGE_NAME = "beybladexmeta-analytics:latest"
$MINIO_URL = "https://minio.vasquezlisciotto.dev/"

Write-Host "=== Beybladexmeta-Analytics Deploy Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build dell'immagine Docker
Write-Host "[1/3] Building Docker image..." -ForegroundColor Yellow
docker build -f dockerfile -t $IMAGE_NAME . --build-arg VITE_PUBLIC_MINIO_URL=$MINIO_URL

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build completed successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Cleanup del vecchio container
Write-Host "[2/3] Removing existing container..." -ForegroundColor Yellow

# Rimuovi forzatamente il container (ignora errori se non esiste)
try {
    docker rm -f $CONTAINER_NAME 2>&1 | Out-Null
}
catch {
    Write-Host "No existing container to remove." -ForegroundColor Gray
}
Write-Host "✅ Container cleanup attempted" -ForegroundColor Green
Write-Host ""

# Step 3: Avvio del nuovo container
Write-Host "[3/3] Starting new container..." -ForegroundColor Yellow
docker run --name $CONTAINER_NAME --env-file .env -p 5000:5000 $IMAGE_NAME

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Container failed to start!" -ForegroundColor Red
    exit 1
}