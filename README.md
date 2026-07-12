# BoothPlus

BoothPlus는 [BOOTH](https://booth.pm) 상품 페이지에서 리뷰를 확인할 수 있는 브라우저 확장 프로그램입니다. Discord OAuth 2.0 인증을 사용하며, 확장 프로그램과 API 서버를 한 저장소에서 개발할 수 있도록 Bun workspace 모노레포로 구성되어 있습니다.

## 워크스페이스

```text
.
├─ apps/
│  ├─ extension/   # WXT + React 브라우저 확장 프로그램
│  └─ backend/     # FastAPI + PostgreSQL API (uv)
├─ deploy/oci/     # OCI 단일 VM 배포 구성과 운영 가이드
├─ .github/        # CI 및 릴리스 워크플로
├─ package.json    # 전체 워크스페이스 명령
└─ bun.lock        # 전체 워크스페이스 lockfile
```

## 로컬 개발

Bun 1.3.1 이상, Node.js 22 이상, Python 3.13, uv, Docker와 Docker Compose가 필요합니다.

```bash
bun install
docker compose up --build
```

Compose는 PostgreSQL이 준비되면 `migrate` 컨테이너로 마이그레이션을 먼저 적용하고 백엔드를 시작합니다. 새 마이그레이션만 다시 적용하려면 `docker compose run --rm migrate`를 실행합니다.

백엔드는 기본적으로 `http://localhost:3000`에서 실행됩니다. `/api/health`는 프로세스의 liveness를 확인하고, `/api/health/storage`는 PostgreSQL 연결과 마이그레이션 준비 상태를 확인합니다. 데이터베이스에 연결할 수 없거나 마이그레이션이 적용되지 않았다면 storage 상태 확인은 `503`을 반환합니다.

호스트에서 앱을 직접 실행하려면 PostgreSQL 컨테이너를 시작하고 마이그레이션을 적용한 뒤 다음 명령을 사용합니다.

```bash
bun run dev:extension
bun run dev:backend
```

로컬 PostgreSQL의 호스트용 연결 문자열은 `postgresql://booth_plus:booth_plus_dev@localhost:5432/booth_plus`이고 `DATABASE_SSL_MODE=disable`을 사용합니다. `bun run db:migrate`나 `bun run dev:backend`를 호스트에서 실행할 때 이 값을 환경 변수로 설정합니다. 운영 자격 증명은 Git에 커밋하지 않습니다.

## 주요 명령

| 명령 | 설명 |
| --- | --- |
| `bun run check` | 모든 패키지의 타입 검사와 단위 테스트 실행 |
| `bun run test:backend` | FastAPI 백엔드 테스트 실행 |
| `bun run lint:backend` | Ruff와 mypy로 백엔드 검사 |
| `bun run build` | 모든 패키지 빌드 |
| `bun run db:migrate` | 현재 `DATABASE_URL`의 PostgreSQL에 미적용 마이그레이션 적용 |
| `bun run docker:build:backend` | 운영용 백엔드 컨테이너 이미지 빌드 |
| `bun run deploy:build` | OCI VM에서 이번 릴리스의 백엔드 이미지 한 번 빌드 |
| `bun run deploy:pull` | 레지스트리에서 이번 릴리스 이미지와 Caddy 가져오기 |
| `bun run deploy:migrate` | OCI 운영 PostgreSQL에 마이그레이션 적용 |
| `bun run deploy:backend` | OCI VM의 백엔드 컨테이너 갱신 |
| `bun run zip` | Chrome 확장 배포용 ZIP 생성 |
| `bun run zip:firefox` | Firefox 확장 배포용 ZIP 생성 |

## OCI 배포와 가용성

운영 환경은 하나의 OCI VM에서 Caddy, FastAPI, PostgreSQL을 Docker Compose로 실행합니다. PostgreSQL 5432와 FastAPI 3000은 외부에 공개하지 않고 Compose 내부 네트워크에서만 연결합니다.

VM이 한 대뿐이므로 VM이나 디스크 장애 시 API와 데이터베이스가 함께 중단됩니다. Docker restart policy는 프로세스 장애와 재부팅에는 대응하지만 이중화나 failover를 제공하지 않습니다. 정기 백업을 VM 외부 저장소로 복사하고 복구 절차를 테스트해야 합니다.

네트워크, TLS, 비밀값, 마이그레이션 및 배포 절차는 [OCI 단일 VM 배포 가이드](deploy/oci/README.md)를 따릅니다.

현재 확장 프로그램은 운영 API(`https://vbt.kamyu.me/api`)를 계속 사용합니다. 이 백엔드는 현재 상태 확인과 PostgreSQL 기반만 구현한 단계이므로 `/auth`, `/user`, `/product`, `/comment` 구현과 전환 테스트가 끝날 때까지 기존 운영 호스트를 이 컨테이너로 교체하면 안 됩니다. 새 API 주소로 전환할 때 확장 API origin과 host permission을 함께 변경해야 합니다.

## 적용 이미지

<p style="align-content: center">
  <img src="./.images/ex1.png" alt="BoothPlus 상품 리뷰 화면">
  <img src="./.images/ex2.png" alt="BoothPlus 사용자 화면">
</p>
