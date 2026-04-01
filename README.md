# ✈️ 인천공항 입국장 실시간 혼잡도

인천국제공항 입국장(A~F)의 실시간 대기 현황과 혼잡도를 시각적으로 제공하는 웹 서비스입니다.

## 주요 기능

- 입국장 A~F 혼잡도를 한눈에 확인 (원활 / 보통 / 혼잡)
- 현재 시각 기준 ±2시간 도착편 조회
- 입국장 클릭 시 항공편별 상세 현황 (내국인 / 외국인 / 예정·실제 도착시간)
- 터미널 탭 전환 (T1 / T2)
- 60초마다 자동 갱신

## 데이터 출처

[공공데이터포털 - 한국공항공사 인천공항 입국장 혼잡도 API](https://www.data.go.kr)

## 로컬 실행

```bash
node server.js
```

브라우저에서 `http://localhost:3000` 접속

## 배포 (Render)

1. GitHub에 push
2. [render.com](https://render.com) → New Web Service → repo 연결
3. Start Command: `node server.js`

> 공공데이터 API는 CORS를 지원하지 않아 `server.js`가 프록시 역할을 합니다.

## 기술 스택

- Vanilla JS / HTML / CSS
- Node.js (프록시 서버)
- 공공데이터포털 REST API
