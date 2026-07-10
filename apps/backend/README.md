# BoothPlus backend

BoothPlus API를 이 모노레포 안에서 구현하기 위한 Node.js + Fastify + TypeScript 애플리케이션입니다. 현재는 서버 설정, CORS allowlist, graceful shutdown, `/api/health` 엔드포인트와 기본 테스트가 준비되어 있습니다.

## 개발

```bash
bun run --filter @booth-plus/backend dev
bun run --filter @booth-plus/backend test
bun run --filter @booth-plus/backend build
```

환경 변수는 `.env.example`을 기준으로 설정합니다. `CORS_ORIGINS`에는 자격 증명을 허용할 origin을 쉼표로 구분해 입력합니다. 판매자 페이지는 `https://*.booth.pm`처럼 호스트의 맨 왼쪽 레이블에만 와일드카드를 사용할 수 있습니다. 확장 패널에서 로컬 API를 호출할 때는 실제 `chrome-extension://<extension-id>` origin도 정확히 추가해야 합니다. 값이 비어 있으면 origin 헤더가 있는 브라우저 요청에는 CORS 권한을 부여하지 않습니다.

## 기존 확장 프로그램과 맞춰야 하는 API 영역

- `/api/auth`: Discord OAuth, access/refresh token
- `/api/user`: 프로필, 아바타, 사용자 설정
- `/api/product`: BOOTH 상품 조회와 검색
- `/api/comment`: 리뷰 CRUD, 내 리뷰, 추천/비추천

구체적인 요청·응답 타입은 현재 `apps/extension/components/review/types.ts`와 `apps/extension/components/review/api.ts`에 있습니다. 백엔드 엔드포인트 구현 시 공용 계약 패키지로 분리할 예정입니다.
