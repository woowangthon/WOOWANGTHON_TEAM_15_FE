# QURE — Expo frontend

Expo SDK 58 기반 QR 입력·상표 OCR 확인·FastAPI 분석 결과 앱입니다.

## 설정과 실행

```powershell
npm ci
Copy-Item .env.example .env
```

프론트 .env의 EXPO_PUBLIC_API_URL을 백엔드 PC의 Wi-Fi IPv4 주소로 설정합니다.

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.0.10:8000
EXPO_PUBLIC_SHOW_MOCKS=false
```

EXPO_PUBLIC_*는 앱에 공개됩니다. BAZE 등 비밀 API 키는 백엔드 .env에만 둡니다.
실제 휴대폰과 PC는 같은 Wi-Fi에 연결하고, 휴대폰 브라우저에서 http://PC_IP:8000/health를 확인하세요.

백엔드 저장소에서:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

프론트 저장소에서:

```powershell
npx expo start --clear
```

설치된 SDK를 지원하는 Expo Go로 테스트합니다. 환경 변수나 의존성을 변경하면 앱을 다시 로드하세요.
AI OCR은 백엔드의 BAZE 키와 이미지 지원 모델을 사용합니다. EasyOCR 모델 설치는 선택용 CPU API에만 필요합니다.

## QR와 OCR 분석

- 기본 스캔은 기기에서 QR URL을 읽어 POST /api/analyze로 전송합니다.
- 'QR 사진으로 상표명도 찾기'를 켜면 사진을 JPEG base64로 변환·축소해 POST /api/ocr/brands의 JSON image_base64로 전송합니다. 백엔드가 외부 BAZE AI로 사진을 보냅니다.
- 상표 후보를 확인하거나 상표 비교를 건너뛴 후 분석합니다. 선택한 정규 상표명은 brand_texts로 전달합니다.
- '추가 정보'에서 상표명을 직접 입력하거나 별도 상표 사진을 읽고 매장을 선택할 수 있습니다.
- AI API는 사진 속 주소도 반환하지만 현재 화면에서는 상표 후보만 사용합니다.
- 분석 요청은 include_ai, inspect_page, include_explanation을 true로 보냅니다. 서버가 제한된 페이지 검사와 AI 분석을 수행합니다.
- 결과는 종합 판정과 확인된 항목·누락된 정보를 보여줍니다. 인식 실패나 0점이 안전을 보증하지 않습니다.
- QR 사이트는 자동으로 열리지 않습니다. 결과 화면에서 사용자 선택과 확인 후 외부 브라우저를 열 수 있습니다.

자세한 요청 규격과 휴대폰 확인 순서는 [OCR 연결 안내](./OCR_INTEGRATION.md)를 참고하세요.

## 검증

```powershell
npm run typecheck
npm run lint
npm test
npm run check:api
npm run check:ocr -- "C:/photos/starbucks.jpg" "스타벅스"
```

check:api는 실행 중인 서버의 상태·응답 스키마·Expo Web CORS를 확인합니다.
Expo Web을 사용하면 백엔드 CORS_ORIGINS에 해당 웹 origin을 등록해야 합니다.
check:ocr는 지정한 사진의 AI OCR을 1회 호출하므로 사용량이 발생할 수 있습니다. 이후 상표 전달 검사는 차단 주소를 사용하여 대상 사이트 접속·페이지 AI 호출 없이 확인합니다.
카메라 권한, 촬영·앨범 선택, 취소, 상표 후보 확인은 휴대폰에서 추가로 확인하세요.
