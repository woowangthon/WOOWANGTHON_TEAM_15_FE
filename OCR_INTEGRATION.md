# OCR와 FastAPI 연결

## 실행

백엔드 저장소에서 (OCR 모델은 이 PC에 준비되어 있음):

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

프론트 저장소에서:

```powershell
npm install
npx expo start --clear
```

프론트 .env의 EXPO_PUBLIC_API_URL은 백엔드 PC의 현재 Wi-Fi IPv4 주소와 8000 포트입니다.
휴대폰과 PC는 같은 Wi-Fi에 연결하고, 휴대폰 브라우저에서 http://PC_IP:8000/health를 확인하세요.
앱에 API 키를 넣지 않습니다.

## 연결 흐름

- 'QR 사진으로 상표명도 찾기'를 켜고 사진을 촬영하거나 QR 사진을 선택합니다.
- 기기에서 QR URL을 읽고, 사진은 JPEG로 변환·축소한 뒤 검사 서버에 업로드합니다.
- POST /api/ocr/brands/local는 multipart/form-data의 image 파일을 받습니다. Content-Type 경계는 fetch가 설정합니다.
- 응답의 ocr_status와 brand_candidates[].brand / matched_text / ocr_confidence를 읽습니다.
- 상표 후보는 자동 확정하지 않습니다. 사용자가 상표를 선택하거나 상표 비교 없이 검사를 진행합니다.
- 선택한 정규 상표명만 POST /api/analyze의 brand_texts에 전달합니다.
- '추가 정보'에서 별도로 상표 사진을 읽어 후보를 선택하거나 직접 입력할 수도 있습니다.
- 사진 속 일반 웹 주소 추출·비교는 CPU OCR 응답에 없으므로 요청이나 화면에 포함하지 않습니다.
- 글자 인식 신뢰도는 사이트 안전도가 아닙니다. 인식 실패·서버 오류·빈 결과는 안전 판정이 아닙니다.
- 사진은 명시적으로 사진 인식을 선택했을 때만 업로드하며 백엔드는 영구 저장하지 않습니다.
- 현재 분석 요청은 페이지 검사·AI 분석·AI 설명을 켜서 보냅니다. 대상 사이트는 백엔드에서 검사합니다.

## 확인

```powershell
npm run typecheck
npm run lint
npm test
npm run check:ocr -- "C:/photos/starbucks.jpg" "스타벅스"
```

check:ocr는 실행 중인 실제 백엔드로 지정한 사진을 보내 OCR을 확인합니다.
이어 차단 대상인 https://127.0.0.1 주소로 분석을 요청하여 상표 전달을 검증합니다.
이 테스트에서는 대상 사이트 접속과 유료 AI 호출이 실행되지 않습니다.

휴대폰에서 추가 확인:
1. 상표 하나·여러 개·상표 없는 사진에서 후보/안내문이 맞게 나오는지.
2. 후보 확인 전에는 URL 분석이 시작되지 않는지.
3. 후보 선택 시 상표가 결과에 반영되고, 건너뛰면 상표 비교를 수행하지 않는지.
4. 취소·재촬영·서버 중지 상황에서 다시 시도할 수 있는지.
5. QR 사이트가 자동으로 열리지 않는지.

Expo SDK 58 이미지 처리 규격:
https://docs.expo.dev/versions/v58.0.0/sdk/imagemanipulator/

기존 BAZE 이미지 인식의 JSON API /api/ocr/brands는 유지합니다. 이 화면은 무료 로컬 CPU OCR /api/ocr/brands/local에 연결되어 있습니다.
