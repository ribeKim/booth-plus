# BoothPlus backend

BoothPlus API를 Docker로 실행하기 위한 Bun + Hono + TypeScript 애플리케이션입니다. 데이터는 PostgreSQL에 저장하며 SQL 마이그레이션, 상태 확인 엔드포인트, 단위 테스트와 실제 PostgreSQL 통합 테스트를 포함합니다.

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 연결 문자열. 필수이며 저장소에 커밋하지 않습니다. |
| `DATABASE_URL_FILE` | `DATABASE_URL` 대신 연결 문자열을 읽을 파일 경로입니다. 운영 컨테이너는 이 방식을 사용합니다. |
| `DATABASE_SSL_MODE` | 로컬 PostgreSQL은 `disable`, OCI 운영 DB는 `verify-full`로 설정합니다. |
| `DATABASE_SSL_CA_FILE` | 운영 PostgreSQL 인증서를 검증할 CA 파일의 컨테이너 내부 경로입니다. |
| `DATABASE_STATEMENT_TIMEOUT_MS` | API 쿼리 제한 시간. 기본값은 5초입니다. |
| `DATABASE_MIGRATION_TIMEOUT_MS` | 마이그레이션 DDL 제한 시간. 기본값은 15분입니다. |
| `PORT` | HTTP 포트. 기본값은 `3000`입니다. |
| `CORS_ORIGINS` | 자격 증명을 허용할 origin을 쉼표로 구분한 목록입니다. |

`DATABASE_URL`과 `DATABASE_URL_FILE`은 동시에 설정할 수 없습니다. 운영 Compose는 앱용 최소 권한 연결 문자열과 마이그레이션용 DDL 연결 문자열을 서로 다른 파일 secret으로 주입합니다.

`CORS_ORIGINS`의 판매자 페이지는 `https://*.booth.pm`처럼 호스트의 맨 왼쪽 레이블에만 와일드카드를 사용할 수 있습니다. Chrome 확장 패널 origin은 공개키에서 계산되는 고정 ID를 정확히 허용합니다.

## 개발

저장소 루트에서 PostgreSQL을 시작하고 마이그레이션을 적용한 다음 전체 구성을 실행합니다.

```bash
bun install
docker compose up --build
```

로컬 Compose의 `migrate` 서비스가 PostgreSQL 준비 후 마이그레이션을 적용하며, 성공한 뒤에만 백엔드를 시작합니다. 새 마이그레이션만 다시 적용하려면 `docker compose run --rm migrate`를 실행합니다.

백엔드만 호스트에서 실행하려면 PostgreSQL 서비스만 띄우고, `DATABASE_URL=postgresql://booth_plus:booth_plus_dev@localhost:5432/booth_plus`와 `DATABASE_SSL_MODE=disable`을 설정한 셸에서 다음 명령을 사용합니다.

```bash
docker compose up -d postgres
bun run db:migrate
bun run dev:backend
```

기본 주소는 `http://localhost:3000`입니다.

- `/api/health`: 데이터베이스 상태와 무관한 liveness 확인
- `/api/health/storage`: PostgreSQL 연결과 필수 마이그레이션의 readiness 확인

PostgreSQL에 연결할 수 없거나 필수 마이그레이션이 적용되지 않았다면 `/api/health/storage`는 `503`을 반환합니다.

## PostgreSQL 마이그레이션

현재 환경의 데이터베이스에 미적용 마이그레이션을 적용합니다.

```bash
bun run db:migrate
```

새 마이그레이션은 저장소 루트에서 생성합니다.

```bash
bun run db:migration:create -- add_product_index
```

마이그레이션 파일은 변경한 애플리케이션 코드와 함께 커밋합니다. 배포 시에는 새 앱 컨테이너를 시작하기 전에 이전 버전과 호환되는 마이그레이션을 먼저 적용합니다.

## 테스트와 이미지 빌드

```bash
bun run check
bun run test:integration
bun run build
bun run docker:build:backend
```

통합 테스트에는 실제 PostgreSQL이 필요합니다. CI는 `postgres:17.10-alpine3.24` 서비스 컨테이너에 마이그레이션을 적용한 뒤 단위 테스트, 통합 테스트, 워크스페이스 빌드와 Docker 이미지 빌드를 순서대로 검증합니다.

## OCI 운영 구성

애플리케이션 컨테이너는 단일 OCI VM에 배포하고, PostgreSQL은 VM 내부 컨테이너가 아닌 **OCI Database with PostgreSQL**을 사용합니다. 운영 DB를 최소 2노드로 구성하면 장애를 감지한 서비스가 복제 노드를 주 노드로 자동 승격할 수 있습니다. 애플리케이션은 전환 중 끊어진 연결을 다시 맺을 수 있어야 합니다.

이 자동 failover는 데이터베이스 계층에만 해당합니다. 애플리케이션 VM을 이중화하지 않으므로 VM 장애 시 API는 복구할 때까지 중단되며, Docker의 자동 재시작만으로는 VM 장애를 해결할 수 없습니다. 백업과 리전 재해 복구도 노드 failover와 별도로 구성해야 합니다.

운영 배포는 저장소 루트에서 다음 명령을 사용합니다.

```bash
bun run deploy:build # 레지스트리 이미지를 쓰면 deploy:pull
bun run deploy:migrate
bun run deploy:backend
```

이미지는 한 번만 빌드하거나 가져온 뒤 동일한 `BACKEND_IMAGE`로 마이그레이션과 서버를 실행합니다. 기존 확장은 아직 구현되지 않은 `/api/auth`, `/api/user`, `/api/product`, `/api/comment`에 의존하므로 이 경로들이 구현되고 전환 검증이 끝나기 전에는 기존 `vbt.kamyu.me` 운영 호스트를 새 컨테이너로 교체하면 안 됩니다.

TLS 인증서, 데이터베이스 자격 증명, VM 준비, 방화벽 및 롤백 절차는 [OCI 단일 VM 배포 가이드](../../deploy/oci/README.md)를 참고합니다.

## 기존 확장 프로그램과 맞춰야 하는 API 영역

- `/api/auth`: Discord OAuth, access/refresh token
- `/api/user`: 프로필, 아바타, 사용자 설정
- `/api/product`: BOOTH 상품 조회와 검색
- `/api/comment`: 리뷰 CRUD, 내 리뷰, 추천/비추천

구체적인 요청·응답 타입은 현재 `apps/extension/components/review/types.ts`와 `apps/extension/components/review/api.ts`에 있습니다. 엔드포인트 구현 시 공용 계약 패키지로 분리할 예정입니다.
