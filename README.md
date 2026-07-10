# BoothPlus

BoothPlus는 [BOOTH](https://booth.pm) 상품 페이지에서 리뷰를 확인할 수 있는 브라우저 확장 프로그램입니다. Discord OAuth 2.0 인증을 사용하며, 확장 프로그램과 API 서버를 한 저장소에서 개발할 수 있도록 Bun workspace 모노레포로 구성되어 있습니다.

## 워크스페이스

```text
.
├─ apps/
│  ├─ extension/   # WXT + React 브라우저 확장 프로그램
│  └─ backend/     # Fastify + TypeScript API 서버
├─ .github/        # CI 및 릴리스 워크플로
├─ package.json    # 전체 워크스페이스 명령
└─ bun.lock        # 전체 워크스페이스 lockfile
```

## 시작하기

Bun 1.3.1 이상과 Node.js 22 이상이 필요합니다. Bun은 workspace와 의존성 설치를 담당하고, 애플리케이션은 Node.js 런타임에서 실행됩니다.

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

백엔드 환경 변수는 `apps/backend/.env.example`을 `apps/backend/.env`로 복사한 뒤 수정합니다. 기본 상태 확인 주소는 `http://localhost:3000/api/health`입니다.

## 주요 명령

| 명령 | 설명 |
| --- | --- |
| `bun run check` | 모든 패키지의 타입 검사와 테스트 실행 |
| `bun run build` | 모든 패키지 빌드 |
| `bun run start:backend` | 빌드된 백엔드 서버 실행 |
| `bun run zip` | Chrome 확장 배포용 ZIP 생성 |
| `bun run zip:firefox` | Firefox 확장 배포용 ZIP 생성 |

현재 확장 프로그램은 운영 API(`https://vbt.kamyu.me/api`)를 계속 사용합니다. 로컬 백엔드 연결은 기존 API 계약을 `apps/backend`로 옮기는 단계에서 함께 적용합니다.

## 적용 이미지

<p style="align-content: center">
  <img src="./.images/ex1.png" alt="BoothPlus 상품 리뷰 화면">
  <img src="./.images/ex2.png" alt="BoothPlus 사용자 화면">
</p>
