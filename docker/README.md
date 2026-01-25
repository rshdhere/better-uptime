# Docker Setup for Better Uptime

This directory contains Docker configurations for self-hosting Better Uptime with Redis. There are separate configurations for **development** and **production** environments.

## Prerequisites

- Docker and Docker Compose installed
- Environment variables configured (see setup below)

## Services

Both configurations include:

1. **Redis** - Self-hosted Redis instance for streams (moved from cloud)
2. **Backend** - Bun server with tRPC API
3. **Frontend** - Next.js client application
4. **Worker** - Bun worker service for processing uptime checks
5. **Publisher** - Bun publisher service for publishing website checks to Redis streams

---

## Development Setup

The development configuration (`docker-compose.dev.yaml`) is optimized for local development with:
- **Hot reload** for all services (Bun `--hot` flag, Next.js dev mode)
- **Volume mounts** for live code changes
- **Development-friendly defaults** (weaker passwords, dev secrets)
- **Faster startup** (no build step required)

### Quick Start (Development)

1. **Set up environment variables** (create `.env` in project root or `packages/config/.env`):

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Auth (can use dev defaults)
JWT_SECRET=dev-secret-change-in-production

# GitHub OAuth
CLIENT_ID_GITHUB=your-github-client-id
CLIENT_SECRET_GITHUB=your-github-client-secret

# Email (Resend)
RESEND_API_KEY=your-resend-api-key

# Redis Configuration (dev defaults)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=dev-password  # Default in dev, change for production

# Backend
BACKEND_PORT=8084

# Frontend
FRONTEND_PORT=3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8084

# Worker Configuration
REGION_ID=us-east-1
WORKER_ID=worker-1

# ClickHouse (optional)
CLICKHOUSE_URL=
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default
CLICKHOUSE_METRICS_TABLE=uptime_checks
```

2. **Start development services**:

```bash
cd docker
docker compose -f docker-compose.dev.yaml up --build
```

3. **Access services**:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:8084
   - Redis: localhost:6379

### Development Features

- **Hot Reload**: Code changes are automatically reflected without restarting containers
- **Volume Mounts**: Source code is mounted, so changes persist
- **Separate Networks**: Uses `better-uptime-network-dev` to avoid conflicts
- **Separate Volumes**: Uses `redis-data-dev` volume (separate from production)

### Development Commands

```bash
# Start services
docker compose -f docker-compose.dev.yaml up

# Start in background
docker compose -f docker-compose.dev.yaml up -d

# View logs
docker compose -f docker-compose.dev.yaml logs -f

# View logs for specific service
docker compose -f docker-compose.dev.yaml logs -f backend

# Stop services
docker compose -f docker-compose.dev.yaml down

# Rebuild and restart
docker compose -f docker-compose.dev.yaml up --build
```

---

## Production Setup

The production configuration (`docker-compose.prod.yaml`) is optimized for production with:
- **Optimized builds** (multi-stage Docker builds)
- **Production environment** variables
- **Resource limits** and restart policies
- **Security best practices** (strong passwords required)
- **Standalone Next.js** output for smaller images

### Quick Start (Production)

1. **Set up environment variables** (use strong, production-ready values):

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Auth (REQUIRED - use strong secret)
JWT_SECRET=your-strong-jwt-secret-here

# GitHub OAuth
CLIENT_ID_GITHUB=your-github-client-id
CLIENT_SECRET_GITHUB=your-github-client-secret

# Email (Resend)
RESEND_API_KEY=your-resend-api-key

# Redis Configuration (REQUIRED - use strong password)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=your-strong-redis-password  # REQUIRED in production

# Backend
BACKEND_PORT=8084

# Frontend
FRONTEND_PORT=3000
NEXT_PUBLIC_BACKEND_URL=http://your-backend-url:8084

# Worker Configuration
REGION_ID=us-east-1
WORKER_ID=worker-1

# ClickHouse (optional)
CLICKHOUSE_URL=
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default
CLICKHOUSE_METRICS_TABLE=uptime_checks
```

2. **Build and start production services**:

```bash
cd docker
docker compose -f docker-compose.prod.yaml up --build -d
```

3. **Verify services are running**:

```bash
docker compose -f docker-compose.prod.yaml ps
```

### Production Commands

```bash
# Build and start
docker compose -f docker-compose.prod.yaml up --build -d

# View logs
docker compose -f docker-compose.prod.yaml logs -f

# Stop services
docker compose -f docker-compose.prod.yaml down

# Stop and remove volumes (⚠️ deletes Redis data)
docker compose -f docker-compose.prod.yaml down -v

# Restart a specific service
docker compose -f docker-compose.prod.yaml restart backend

# Rebuild a specific service
docker compose -f docker-compose.prod.yaml up --build -d backend
```

---

## Service Details

### Redis

- **Image**: `redis:7-alpine`
- **Port**: `6379` (exposed to host)
- **Volume**: 
  - Development: `redis-data-dev`
  - Production: `redis-data`
- **Configuration**:
  - Password protected (via `REDIS_PASSWORD`)
  - AOF (Append Only File) persistence enabled
  - Memory limit: 256MB with LRU eviction policy
- **Health Check**: Automatic health checks configured

### Backend

- **Runtime**: Bun
- **Port**: `8084` (configurable via `BACKEND_PORT`)
- **Development**: Hot reload enabled, volume mounts for source code
- **Production**: Optimized build, production environment
- **Dependencies**: Redis (waits for Redis to be healthy)

### Frontend

- **Runtime**: Node.js (Next.js)
- **Port**: `3000` (configurable via `FRONTEND_PORT`)
- **Development**: Next.js dev mode with hot reload, volume mounts
- **Production**: Standalone build for smaller image size
- **Dependencies**: Backend service

### Worker

- **Runtime**: Bun
- **Function**: Processes uptime checks from Redis streams
- **Development**: Hot reload enabled, volume mounts
- **Production**: Optimized build
- **Dependencies**: Redis, Backend

### Publisher

- **Runtime**: Bun
- **Function**: Publishes website checks to Redis streams every 3 minutes
- **Development**: Hot reload enabled, volume mounts
- **Production**: Optimized build
- **Dependencies**: Redis, Backend

---

## Networking

Services communicate via Docker networks:
- **Development**: `better-uptime-network-dev`
- **Production**: `better-uptime-network`

Services can communicate using their service names:
- Redis: `redis:6379`
- Backend: `backend:8084`
- Frontend: `frontend:3000`

---

## Data Persistence

- **Redis Data**: 
  - Development: Stored in `redis-data-dev` volume
  - Production: Stored in `redis-data` volume
- **PostgreSQL**: If using PostgreSQL in Docker, configure separately

---

## Troubleshooting

### Redis Connection Issues

If services can't connect to Redis:

1. Check Redis is healthy: `docker compose ps`
2. Verify Redis password matches in `.env` and docker-compose file
3. Check network connectivity: `docker compose exec backend ping redis`
4. View Redis logs: `docker compose logs redis`

### Build Issues

If builds fail:

1. Clear Docker cache: `docker compose build --no-cache`
2. Check Dockerfile paths are correct
3. Verify all package.json files exist
4. Ensure pnpm-lock.yaml is up to date

### Port Conflicts

If ports are already in use:

1. Change ports in `.env` file
2. Update docker-compose.yaml port mappings
3. Restart services: `docker compose restart`

### Hot Reload Not Working (Development)

1. Verify volume mounts are correct: `docker compose config`
2. Check file permissions on mounted volumes
3. Ensure source code is in the correct location
4. Restart the service: `docker compose restart backend`

---

## Migration from Cloud Redis

When migrating from cloud Redis to self-hosted:

1. **Before migration**: Ensure all pending messages are processed
2. **Update environment**: Change `REDIS_HOST` from cloud URL to `redis`
3. **Deploy**: Start Docker services
4. **Verify**: Check logs to ensure services connect successfully
5. **Monitor**: Watch for any connection errors or message processing issues

---

## Security Notes

### Development
- Uses default/weak passwords for convenience
- Suitable only for local development
- Never use in production

### Production
- **Redis Password**: Always set a strong `REDIS_PASSWORD` in production
- **JWT Secret**: Use a cryptographically secure random string
- **Environment Variables**: Never commit `.env` files to version control
- **Network**: Services are isolated in Docker networks
- **Ports**: Only necessary ports are exposed to the host
- **Updates**: Regularly update base images for security patches

---

## Maintenance

### Redis Data Backup

```bash
# Create backup (production)
docker compose -f docker-compose.prod.yaml exec redis redis-cli --rdb /data/dump.rdb

# Copy backup from container
docker cp better-uptime-redis:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb
```

### Redis Data Restore

```bash
# Copy backup to container
docker cp ./redis-backup.rdb better-uptime-redis:/data/dump.rdb

# Restart Redis to load backup
docker compose -f docker-compose.prod.yaml restart redis
```

### View Redis Info

```bash
# Connect to Redis CLI (production)
docker compose -f docker-compose.prod.yaml exec redis redis-cli

# Or with password
docker compose -f docker-compose.prod.yaml exec redis redis-cli -a $REDIS_PASSWORD
```

### Development Redis CLI

```bash
# Connect to Redis CLI (development)
docker compose -f docker-compose.dev.yaml exec redis redis-cli -a dev-password
```

---

## Scaling

To scale services in production:

```bash
# Scale worker instances
docker compose -f docker-compose.prod.yaml up -d --scale worker=3

# Scale publisher instances (usually only need 1)
docker compose -f docker-compose.prod.yaml up -d --scale publisher=1
```

Note: Multiple workers will share the same consumer group, distributing load across instances.

---

## Switching Between Dev and Prod

To switch between development and production:

```bash
# Stop current environment
docker compose -f docker-compose.dev.yaml down
# or
docker compose -f docker-compose.prod.yaml down

# Start other environment
docker compose -f docker-compose.dev.yaml up
# or
docker compose -f docker-compose.prod.yaml up --build -d
```

**Important**: Development and production use separate networks and volumes, so they won't interfere with each other.
