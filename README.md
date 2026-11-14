QURE
QR 코드를 스캔하고, 링크를 열기 전에 위험 신호를 확인하는 모바일 앱

식당 테이블이나 포스터의 QR 코드가 위조 스티커로 바뀌면, 겉모습만으로는 연결 주소가 달라졌는지 알기 어렵습니다. QURE는 QR 주소를 읽어 검사 서버에 보내고, 주소와 상표의 공식 도메인 비교 결과 등을 보여줍니다. 이 저장소에는 우왕톤 15팀의 Expo 모바일 프런트엔드가 들어 있습니다.
주요 기능
기능	동작
QR 입력	실시간 카메라로 스캔하거나 앨범에서 QR 이미지를 선택합니다. 사진 분석 옵션을 켜면 카메라 버튼으로 사진을 촬영할 수 있습니다.
상표 비교	사진 OCR로 읽은 상표 후보를 확인하거나 상표명을 직접 입력할 수 있습니다. 등록 매장을 검색해 검사에 사용할 수도 있습니다.
위험도 결과	서버의 종합 판정과 판단 근거, 검사 항목별 결과를 표시합니다. AI 설명이 반환되면 함께 표시합니다.
링크 열기	앱은 링크를 자동으로 열지 않습니다. 접속 가능한 주소는 사용자가 결과 화면에서 확인한 뒤 외부 브라우저로 열 수 있습니다. 서버가 차단한 주소는 열 수 없습니다.


데이터 흐름
기본 모드에서는 기기에서 QR을 읽고, HTTP 또는 HTTPS 주소를 검사 서버에 보냅니다. 일반 텍스트가 들어 있는 QR은 화면에 표시하며 검사 서버에 보내지 않습니다.

QR 사진으로 상표명도 찾기를 켜면 서버가 먼저 사진에서 QR을 읽고, 실패하면 기기 인식으로 재시도합니다. 상표명 OCR을 요청하면 사진은 백엔드를 거쳐 외부 BAZE AI로 전송됩니다.
메서드 및 경로	용도
POST /api/analyze	QR 주소와 입력된 상표명·인쇄 도메인·매장 정보를 바탕으로 분석을 요청합니다. 프런트엔드는 페이지 검사, AI 분석, 설명을 요청합니다.
POST /api/qr/decode	사진 분석 모드에서 이미지 속 QR을 읽습니다.
POST /api/ocr/brands	사진에서 상표 후보를 읽습니다.
GET /api/stores/search	상표명 키워드로 등록 매장을 검색합니다.


검사는 자동으로 수행되며 결과는 링크의 안전을 보장하지 않습니다.
기술 스택
- 앱 — Expo SDK 58, React Native, React, TypeScript
- QR·이미지 처리 — Expo Camera, Expo Image Picker, Expo Image Manipulator
- 서버 연동 — FastAPI JSON API
로컬 실행
Node.js 24와 npm, Expo SDK 58을 지원하는 Expo Go, 실행 중인 QURE 백엔드가 필요합니다.
1. 저장소를 내려받고 의존성 설치
git clone https://github.com/woowangthon/WOOWANGTHON_TEAM_15_FE.git
cd WOOWANGTHON_TEAM_15_FE
npm ci
2. 백엔드 주소 설정
저장소 루트의 .env.example을 복사해 .env 파일을 만듭니다. 아래 예시의 IP를 백엔드를 실행하는 PC의 로컬 IPv4 주소로 바꿉니다.
EXPO_PUBLIC_API_URL=http://IP주소:8000
EXPO_PUBLIC_SHOW_MOCKS=false
- 백엔드 저장소에서 가상 환경을 활성화한 후 python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000으로 개발 서버를 실행합니다. PC와 휴대폰을 같은 Wi-Fi에 연결합니다.
- 휴대폰 브라우저에서 http://<백엔드-PC-IP>:8000/health가 열리는지 확인합니다.
- 개발 중 예시 결과를 확인하려면 EXPO_PUBLIC_SHOW_MOCKS=true로 설정합니다.
- EXPO_PUBLIC_* 값은 앱에서 읽을 수 있으므로 BAZE 키 같은 비밀 값은 백엔드 환경 변수에 설정합니다.
3. 앱 실행
npx expo start --clear
터미널에 표시된 Expo 개발 서버 QR을 휴대폰으로 열어 앱을 실행합니다. 앱이 열린 뒤 검사할 QR로 기능을 테스트합니다.
개발 확인
명령	확인 항목
npm run typecheck	TypeScript 타입 검사
npm run lint	ESLint 검사
npm test	QR 인식, API, 결과 판정 관련 단위 테스트
npm run check:api	실행 중인 백엔드의 상태, API 스키마, 웹 CORS
npm run check:ocr -- "C:/photos/example.jpg" "스타벅스"	사진 OCR 및 상표명 전달 검사. 실제 AI OCR 호출 1회가 발생할 수 있습니다.


주요 파일
경로	역할
App.tsx	스캔, 사진 선택, 상표 확인, 결과 화면 전환
src/qr/	기기 사진 QR 인식 및 재시도
src/api/	QR 분석, 사진 디코딩, OCR, 매장 검색 요청
src/input/ExtraInfo.tsx	상표명 입력과 매장 선택
src/result/	판정 표시 규칙과 결과 화면
tests/	단위 테스트


OCR 연동과 실기기 확인 절차는 [OCR_INTEGRATION.md](./OCR_INTEGRATION.md)를 참고하세요.
출처 및 라이선스
이 제품에는 MaxMind가 제공하는 GeoLite2 데이터가 포함되어 있습니다. 프런트엔드 라이선스는 MIT입니다.
