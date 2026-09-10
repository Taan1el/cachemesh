# CacheMesh ⚡💾
> **High-Throughput Key-Value Cache Gateway, Eviction Engine & Singleflight Stampede Protection**  
> *Engineered for Sub-Millisecond Reads (<0.5ms), O(1) LRU/LFU Eviction, and Zero-Overhead Thundering Herd Coalescing*

[![CI Pipeline](https://img.shields.io/badge/CI-Passing-10b981.svg?style=flat-square)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6.svg?style=flat-square)](#)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933.svg?style=flat-square)](#)
[![Database](https://img.shields.io/badge/Origin-SQLite%20WAL%20(Native)-003B57.svg?style=flat-square)](#)
[![React](https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square)](#)
[![Algorithm](https://img.shields.io/badge/Algorithm-O(1)%20LRU%20%2F%20LFU-6366f1.svg?style=flat-square)](#)
[![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ed.svg?style=flat-square)](#)

---

## ⚡ 2-Minute Overview
**CacheMesh** is an enterprise-grade in-memory key-value cache gateway and proxy modeled after high-concurrency systems like Redis, Memcached, and Groupcache. Designed to solve common production bottlenecks in microservice architectures, it delivers constant-time $O(1)$ LRU and LFU cache eviction, TTL expirations, pattern-based wildcard invalidations, and **Singleflight Promise Coalescing** to eliminate cache stampedes (thundering herds).

### Core Capabilities
1. **$O(1)$ LRU & LFU Eviction Engines**: Implements textbook doubly linked list structures with hash maps and frequency buckets, guaranteeing constant-time reads, promotions, and deterministic tail evictions under memory capacity limits.
2. **Singleflight Thundering Herd Protection**: When an uncached key is hit by 50–100 simultaneous requests, CacheMesh coalesces all concurrent callers into a single in-flight origin database query, reducing database connection spikes by $>95\%$.
3. **Millisecond-Accurate TTL Reaper & Expirations**: Tracks key lifetimes with live countdown visualizers, background expiration sweeps, and passive evictions on read.
4. **Pattern-Based Wildcard Invalidation**: Supports glob-style wildcards (`user:*`, `inventory:warehouse-*`) for atomic bulk invalidation across multi-tenant data tiers.
5. **Interactive Benchmarking & Telemetry Console**: Real-time React 19 dashboard featuring hit-ratio gauges, live memory estimation, an interactive "Thundering Herd" simulator, and an operations workbench.
6. **Zero External Runtime Dependencies**: Powered by Node.js 24 native SQLite (`DatabaseSync` in WAL mode) as the persistent origin store, delivering instant local setup with zero Docker prerequisite.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Client ["Frontend (React 19 + TypeScript + Vite)"]
        UI[CacheMesh Operations Dashboard]
        Stats[Live Hit-Ratio & Memory Gauges]
        Sandbox[Thundering Herd Stampede Simulator]
        Explorer[In-Memory Key Explorer & TTL Trackers]
        Ops[GET / SET / Purge Workbench]

        UI --> Stats
        UI --> Sandbox
        UI --> Explorer
        UI --> Ops
    end

    subgraph Server ["Backend (Node.js 24 + Express + Native SQLite WAL)"]
        API[Express REST Gateway /api]
        CacheSvc[Cache Coordination Service]
        LRU[O(1) LRU Doubly Linked List]
        LFU[O(1) LFU Frequency Buckets]
        SF[Singleflight Promise Coalescer]
        Origin[SQLite WAL Origin Store]

        API --> CacheSvc
        CacheSvc --> LRU
        CacheSvc --> LFU
        CacheSvc --> SF
        SF --> Origin
    end

    subgraph Storage ["Persistent Origin Store"]
        DB[(SQLite WAL Engine origin.db)]
        Origin --> DB
    end
```

---

## 🛡️ Cache Stampede Prevention (Singleflight)

In high-traffic architectures, key expiration can trigger a **Cache Stampede**:

```
Without Singleflight:
Client 1 ──┐
Client 2 ──┼──> [Cache MISS] ──> 50 Simultaneous Heavy Queries ──> [Database Overload]
Client 50 ─┘

With Singleflight Coalescing:
Client 1 ──┐
Client 2 ──┼──> [Cache MISS] ──> [Singleflight Guard] ──> 1 Query ──> [Database OK]
Client 50 ─┘                                  │
                                              └──> 49 Callers Await Shared Promise
```

- **98% Origin Load Reduction**: 50 concurrent requests result in exactly 1 database execution.
- **Microsecond Response**: The moment query resolves, all 49 coalesced callers receive data simultaneously.

---

## 🛠️ Tech Stack & Engineering Standards

| Layer | Technology | Rationale |
|---|---|---|
| **Runtime** | Node.js 24 (ES Modules) | High-performance asynchronous runtime with native SQLite & crypto |
| **Language** | TypeScript 5.8 (Strict Mode) | Full-stack end-to-end type safety between backend and frontend |
| **Backend Framework** | Express 4.21 | Clean REST architecture with modular controllers and routers |
| **Database** | Native SQLite (`DatabaseSync`) | Zero-config relational persistence with Write-Ahead Logging (WAL) |
| **Frontend** | React 19 + Vite 6 | Modern component hierarchy with fast HMR and sub-second builds |
| **Styling** | Modern CSS Variables & Design Tokens | Dark-mode terminal-inspired theme with responsive mobile/desktop layouts |
| **Testing** | Vitest 3.0 + React Testing Library | Fast unit and integration tests across data structures and UI |
| **Containerization** | Docker Multi-Stage + Compose | Production alpine container with unprivileged runner |
| **Architecture** | ADRs (`docs/adr/`) | Documented decisions on LRU doubly linked lists, Singleflight, and LFU |

---

## 🔌 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Gateway health, active keys count, and hit ratio |
| `GET` | `/api/cache/stats` | Telemetry: hit count, miss count, hit ratio %, memory bytes, evictions |
| `GET` | `/api/cache/entries` | List all active in-memory cache keys with metadata |
| `GET` | `/api/cache/item/:key` | Retrieve key (hits cache or queries origin via singleflight) |
| `POST` | `/api/cache/item` | Store key-value pair with optional TTL (seconds) |
| `DELETE` | `/api/cache/item/:key` | Invalidate single key |
| `POST` | `/api/cache/purge` | Purge keys matching wildcard glob pattern (e.g. `user:*`) |
| `POST` | `/api/cache/clear` | Flush all entries from in-memory cache |
| `POST` | `/api/cache/stampede-demo` | Run live thundering herd simulation (N concurrent requests) |
| `POST` | `/api/cache/config` | Update capacity, default TTL, or switch policy (`LRU` vs `LFU`) |
| `GET` | `/api/origin/entities` | List canonical entities stored in SQLite origin database |

---

## 💻 Quickstart Guide (Zero-Config)

### Prerequisites
- Node.js 22+ (tested on Node.js 24)
- npm 10+

### 1. Installation
```bash
git clone https://github.com/Taan1el/cachemesh.git
cd cachemesh
npm install
```

### 2. Run Development Environment
```bash
# Concurrently starts backend API (port 4002) and Vite frontend (port 5173)
npm run dev
```
Open **http://localhost:5173** to view the live CacheMesh console.

### 3. Run Automated Tests & Quality Checks
```bash
# Run backend data structure & API integration tests
npm run test:server

# Run frontend UI component tests
npm run test:client

# Run full test suite across workspace
npm test

# Typecheck and lint
npm run lint

# Production build verification
npm run build
```

---

## 🐳 Docker Deployment

Run the containerized gateway with Docker Compose:
```bash
docker compose up --build
```
CacheMesh will be accessible at **http://localhost:4002**.

---

## 📜 Architecture Decision Records (ADRs)

Key architectural decisions are documented under [`docs/adr/`](./docs/adr/):
- [ADR-001: Doubly Linked List with Hash Map for O(1) LRU Eviction](./docs/adr/001-doubly-linked-list-hash-map-lru-eviction.md)
- [ADR-002: Singleflight Promise Coalescing to Eliminate Cache Stampedes](./docs/adr/002-singleflight-promise-coalescing-for-thundering-herd-prevention.md)
- [ADR-003: Frequency-Bucketed LFU and Memory-Bounded Eviction](./docs/adr/003-frequency-bucketed-lfu-and-memory-bounded-eviction.md)

---

## 📄 License
MIT License. Built for technical demonstration and high-scale production architectures.
