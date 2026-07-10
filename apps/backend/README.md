# BoothPlus backend

BoothPlus API를 Cloudflare Workers에 배포하기 위한 Hono + TypeScript 애플리케이션입니다. 데이터는 Cloudflare D1에 저장하며, Wrangler 설정, SQL 마이그레이션, 런타임 타입, Hono API 계약 테스트가 포함되어 있습니다.

## 개발

```bash
bun run db:migrate:local
bun run dev:backend
bun run typegen:backend
bun run build:backend
bun run deploy:backend
```

로컬 Worker는 기본적으로 `http://localhost:8787`에서 실행됩니다. 로컬 바인딩을 덮어쓸 때는 `.dev.vars.example`을 `.dev.vars`로 복사합니다.

`/api/health`는 Worker liveness를, `/api/health/storage`는 D1 바인딩과 필수 테이블 준비 상태를 확인합니다. 마이그레이션이 적용되지 않았거나 D1을 사용할 수 없으면 storage 상태 확인은 `503`을 반환합니다.

`CORS_ORIGINS`에는 자격 증명을 허용할 origin을 쉼표로 구분해 입력합니다. 판매자 페이지는 `https://*.booth.pm`처럼 호스트의 맨 왼쪽 레이블에만 와일드카드를 사용할 수 있습니다. Chrome 확장 패널 origin은 공개키에서 계산되는 고정 ID를 정확히 허용합니다.

## D1 데이터베이스

Worker에서는 D1을 `env.DB`로 사용합니다. 초기 마이그레이션은 사용자, OAuth 계정, 인증 세션, 상점, 상품, 썸네일, 댓글, 댓글 투표 테이블을 생성합니다. 액세스 토큰은 저장하지 않으며 refresh token은 원문이 아닌 해시만 `auth_sessions`에 저장합니다.

로컬 D1은 Cloudflare 계정 없이 사용할 수 있습니다. 처음 실행하거나 마이그레이션이 추가된 뒤 아래 명령을 실행합니다.

```bash
bun run db:migrate:local
bun run dev:backend
```

새 마이그레이션은 저장소 루트에서 다음과 같이 생성합니다.

```bash
bun run db:migration:create -- add_product_index
```

운영 D1은 최초 한 번 명시적으로 생성합니다. 위치 힌트는 서비스 사용 지역에 맞게 선택하며, 한국·일본 중심이면 `apac`을 사용할 수 있습니다.

```bash
bun run db:create -- --location apac
bun run db:migrate:remote
bun run deploy:backend
```

`db:create`는 `wrangler.jsonc`에 실제 `database_name`과 `database_id`를 기록합니다. 이 ID는 비밀값이 아니므로 설정과 함께 커밋할 수 있습니다. 기본 배포 명령은 자동 리소스 생성을 꺼 두어, D1을 만들지 않은 상태에서는 안전하게 실패합니다. `.wrangler`는 삭제 가능한 로컬 상태이며 Git에 포함하지 않습니다.

## 배포

`bun run deploy:backend`는 현재 Cloudflare 계정의 `booth-plus-backend` Worker로 배포합니다. 실행 전에 운영 D1 마이그레이션을 적용하고, Wrangler 로그인 또는 `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID`를 설정해야 합니다. Custom Domain을 사용할 경우 계정의 Zone을 확인한 뒤 `wrangler.jsonc`에 route를 추가합니다.

Discord client secret, JWT 서명 키, 데이터베이스 자격증명은 저장소의 `vars`에 넣지 않고 `apps/backend`에서 `bun x wrangler secret put <NAME>`으로 등록해야 합니다.

## 기존 확장 프로그램과 맞춰야 하는 API 영역

- `/api/auth`: Discord OAuth, access/refresh token
- `/api/user`: 프로필, 아바타, 사용자 설정
- `/api/product`: BOOTH 상품 조회와 검색
- `/api/comment`: 리뷰 CRUD, 내 리뷰, 추천/비추천

구체적인 요청·응답 타입은 현재 `apps/extension/components/review/types.ts`와 `apps/extension/components/review/api.ts`에 있습니다. 엔드포인트 구현 시 공용 계약 패키지로 분리할 예정입니다.
