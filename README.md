# BoothPlus

BoothPlus는 [BOOTH](https://booth.pm) 상품 페이지에서 리뷰를 확인할 수 있는 브라우저 확장 프로그램입니다. Discord OAuth 2.0 인증을 사용하며, 확장 프로그램과 API 서버를 한 저장소에서 개발할 수 있도록 Bun workspace 모노레포로 구성되어 있습니다.

## 워크스페이스

```text
.
├─ apps/
│  ├─ extension/   # WXT + React 브라우저 확장 프로그램
│  └─ backend/     # Hono + Cloudflare Workers + D1 API
├─ .github/        # CI 및 릴리스 워크플로
├─ package.json    # 전체 워크스페이스 명령
└─ bun.lock        # 전체 워크스페이스 lockfile
```

## 시작하기

Bun 1.3.1 이상과 Node.js 22 이상이 필요합니다. Bun은 workspace와 의존성 설치를 담당하며, 백엔드는 Cloudflare Workers 런타임을 대상으로 빌드됩니다.

```bash
bun install
```

확장 프로그램과 백엔드를 함께 실행합니다.

```bash
bun run dev
```

각 앱을 따로 실행할 수도 있습니다.

```bash
bun run dev:extension
bun run dev:backend
```

백엔드 로컬 바인딩은 `apps/backend/.dev.vars.example`을 `apps/backend/.dev.vars`로 복사한 뒤 수정합니다. Wrangler 개발 서버의 기본 상태 확인 주소는 `http://localhost:8787/api/health`입니다.

처음 백엔드를 실행하거나 SQL 마이그레이션이 추가되면 로컬 D1에 마이그레이션을 적용합니다.

```bash
bun run db:migrate:local
```

## 주요 명령

| 명령 | 설명 |
| --- | --- |
| `bun run check` | 모든 패키지의 타입 검사와 테스트 실행 |
| `bun run build` | 모든 패키지 빌드 |
| `bun run db:create` | 운영 Cloudflare D1 생성 및 실제 바인딩 ID 기록 |
| `bun run db:migration:create -- <name>` | 새 D1 SQL 마이그레이션 생성 |
| `bun run db:migrate:local` | 로컬 D1에 미적용 마이그레이션 적용 |
| `bun run db:migrate:remote` | 운영 D1에 미적용 마이그레이션 적용 |
| `bun run typegen:backend` | Wrangler 설정에서 Worker 런타임·바인딩 타입 생성 |
| `bun run deploy:backend` | Cloudflare Workers에 백엔드 배포 |
| `bun run zip` | Chrome 확장 배포용 ZIP 생성 |
| `bun run zip:firefox` | Firefox 확장 배포용 ZIP 생성 |

현재 확장 프로그램은 운영 API(`https://vbt.kamyu.me/api`)를 계속 사용합니다. Worker Custom Domain 또는 `workers.dev` 주소가 확정되면 확장 API origin과 host permission을 함께 전환해야 합니다.

## 적용 이미지

<p style="align-content: center">
  <img src="./.images/ex1.png" alt="BoothPlus 상품 리뷰 화면">
  <img src="./.images/ex2.png" alt="BoothPlus 사용자 화면">
</p>
