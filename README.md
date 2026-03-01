# ZOC9

족구 모임 운영과 매치 기록을 위한 모바일 웹(PWA) 서비스입니다.

## 기술 스택
- React + TypeScript + Vite
- React Router
- TailwindCSS v4
- TanStack Query
- Zustand
- React Hook Form + Zod
- Supabase (Schema/RLS/RPC)
- Vitest + Playwright

## 문서 패키지
- PRD: `docs/prd/2026-02-28-zoc9-prd.md`
- 족구 규칙: `docs/domain/jokgu-rules.md`
- 메뉴 맵: `docs/domain/menu-map.md`
- 아키텍처 ADR: `docs/adr/001-architecture.md`

## 실행 방법
1. 의존성 설치
```bash
npm install
```

2. 환경 변수 설정
```bash
cp .env.example .env
```
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 입력합니다.
필요 시 `VITE_DATA_MODE`를 설정합니다.
- `supabase` (기본): Supabase 정본 사용
- `local`: 로컬 데이터 레이어 강제 사용 (개발/테스트)

3. 개발 서버 실행
```bash
npm run dev
```

## 스크립트
- `npm run dev`: 개발 서버
- `npm run build`: 타입체크 + 프로덕션 빌드
- `npm run lint`: ESLint
- `npm run test`: Vitest (규칙 엔진 단위 테스트)
- `npm run test:e2e`: Playwright E2E
- `npm run test:integration`: Supabase RPC/RLS 통합 테스트

## Supabase
- 마이그레이션: `supabase/migrations/20260228210000_init.sql`
- 추가 마이그레이션:
  - `20260228223500_rotation_independent_fix.sql`
  - `20260228232000_match_completion_fix.sql`
  - `20260228235500_ops_management_phase1.sql`
- 포함 내용: 테이블, 인덱스, RLS 정책, 핵심 RPC
  - `rpc_accept_invite`
  - `rpc_create_match`
  - `rpc_start_set`
  - `rpc_record_rally`
  - `rpc_finalize_set`
  - `rpc_finalize_match`
  - `rpc_complete_meeting`
  - `rpc_edit_completed_record`
  - `rpc_create_group`
  - `rpc_update_group_name`
  - `rpc_update_member_role`
  - `rpc_update_member_permissions`
  - `rpc_remove_group_member`
  - `rpc_cancel_invite`
  - `rpc_reissue_invite`
  - `rpc_create_venue`, `rpc_update_venue`, `rpc_delete_venue`
  - `rpc_create_notice`, `rpc_update_notice`, `rpc_delete_notice`
  - `rpc_list_received_invites`

## 현재 구현 범위
- 인증/회원가입/세션/프로필 수정/비밀번호 변경 (Supabase Auth)
- 그룹/멤버/권한/초대/구장/공지 운영 기능
- 모임 생성/상태 변경/상세 정보(구장/참여 멤버)
- 매치 생성(심판, 수동 팀/포지션 구성), 세트 라이브 기록
- 서브권/로테이션/듀스/선승제/조기종료(ignored) 규칙 엔진
- 완료 기록 관리자 예외 수정 + 감사로그
- 포지션별 승률 포함 기본 통계
- PWA 설치/캐시 및 오프라인 큐 동기화

## 참고
- 이 저장소는 로컬 우선 데이터 레이어를 포함하며, Supabase RPC 호출은 준비되어 있습니다.
- 프로덕션에서는 Supabase 테이블을 정본으로 사용하고 로컬 레이어를 API 어댑터로 대체하면 됩니다.
