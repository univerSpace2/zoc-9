# ADR-001: ZOC9 v1 아키텍처 선택

- 상태: Accepted
- 날짜: 2026-02-28
- 결정자: Product/Engineering

## Context
ZOC9 v1은 모바일 웹 중심으로 빠르게 출시해야 하며, 족구 기록 규칙의 무결성과 운영 편의성이 핵심이다.

주요 요구사항:
- 빠른 UI 반응(현장 기록)
- 서버 최종 검증(규칙 위반 방지)
- 오프라인/복귀 대응
- 운영 복잡도 최소화

## Decision
`React SPA + Supabase(Auth/Postgres/RPC) + 핵심 RPC 검증` 구조를 채택한다.

- 프론트: React, React Router, TanStack Query, Zustand, RHF+Zod, TailwindCSS
- 백엔드: Supabase(Postgres + RLS + RPC)
- 데이터 무결성: 득점/세트/매치 확정 로직은 RPC에서 최종 검증
- 오프라인: 클라이언트 로컬 큐(IndexedDB) + 재연결 시 RPC 멱등 재전송

## Alternatives
### A. SPA + Supabase + RPC (채택)
장점:
- 초기 개발 속도 빠름
- 인프라 단순, 운영 비용 낮음
- RLS/RPC로 보안/검증 책임 명확
단점:
- 복잡한 도메인 로직이 SQL/RPC에 일부 집중됨

### B. SPA + BFF + Supabase
장점:
- 백엔드 도메인 로직 제어 유연성 높음
- 보안/검증 계층 추가 가능
단점:
- 초기 개발/운영 복잡도 증가
- v1 출시 속도 저하

### C. 클라이언트 규칙엔진 중심
장점:
- 초기 개발 매우 빠름
단점:
- 동기화 충돌 및 무결성 리스크 큼
- 서버 신뢰성 부족

## Consequences
- 서버는 정본(source of truth), 클라이언트는 낙관적 반영 후 재동기화.
- RPC와 RLS 설계 품질이 서비스 신뢰성을 좌우하므로 DB 설계/테스트에 투자 필요.
- v1 이후 트래픽/복잡도 증가 시 BFF 도입을 재평가한다.

## Follow-up
1. 핵심 RPC 함수와 RLS 정책 구현.
2. 규칙 엔진 단위 테스트 + RPC 통합 테스트 작성.
3. PWA 캐시 전략과 오프라인 큐 충돌 정책 검증.
