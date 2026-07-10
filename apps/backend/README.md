# BoothPlus backend

BoothPlus API를 Cloudflare Workers에 배포하기 위한 Hono + TypeScript 애플리케이션입니다. Wrangler 설정, 런타임 타입 생성, Hono API 계약 테스트, `/api/health` 엔드포인트가 준비되어 있습니다.

## 개발

```bash
bun run dev:backend
bun run typegen:backend
bun run build:backend
bun run deploy:backend
```

로컬 Worker는 기본적으로 `http://localhost:8787`에서 실행됩니다. 로컬 바인딩을 덮어쓸 때는 `.dev.vars.example`을 `.dev.vars`로 복사합니다.

`CORS_ORIGINS`에는 자격 증명을 허용할 origin을 쉼표로 구분해 입력합니다. 판매자 페이지는 `https://*.booth.pm`처럼 호스트의 맨 왼쪽 레이블에만 와일드카드를 사용할 수 있습니다. Chrome 확장 패널 origin은 공개키에서 계산되는 고정 ID를 정확히 허용합니다.

## 배포

`bun run deploy:backend`는 현재 Cloudflare 계정의 `booth-plus-backend` Worker로 배포합니다. 실행 전에 Wrangler 로그인 또는 `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID` 설정이 필요합니다. Custom Domain을 사용할 경우 계정의 Zone을 확인한 뒤 `wrangler.jsonc`에 route를 추가합니다.

Discord client secret, JWT 서명 키, 데이터베이스 자격증명은 저장소의 `vars`에 넣지 않고 `apps/backend`에서 `bun x wrangler secret put <NAME>`으로 등록해야 합니다.

## 기존 확장 프로그램과 맞춰야 하는 API 영역

- `/api/auth`: Discord OAuth, access/refresh token
- `/api/user`: 프로필, 아바타, 사용자 설정
- `/api/product`: BOOTH 상품 조회와 검색
- `/api/comment`: 리뷰 CRUD, 내 리뷰, 추천/비추천

구체적인 요청·응답 타입은 현재 `apps/extension/components/review/types.ts`와 `apps/extension/components/review/api.ts`에 있습니다. 엔드포인트 구현 시 공용 계약 패키지로 분리할 예정입니다.
