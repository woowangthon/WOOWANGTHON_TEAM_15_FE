# AI OCR와 FastAPI 연결

현재 앱은 팀원이 만든 **BAZE AI 이미지 인식 OCR**을 사용합니다.
CPU OCR은 대체 API로 남아 있으며 앱이 자동으로 전환하지 않습니다.

## 실행과 설정

백엔드 .env의 BAZE_API_KEY, BAZE_BASE_URL, BAZE_MODEL을 설정합니다.
OCR에 별도 이미지 지원 모델을 쓰려면 BAZE_VISION_MODEL을 설정합니다. 비워두면 BAZE_MODEL을 사용합니다.
기존 이 PC의 키는 변경하지 않습니다. AI OCR에는 EasyOCR 모델 설치가 필요하지 않습니다.

백엔드 저장소에서:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

프론트 .env의 EXPO_PUBLIC_API_URL은 백엔드 PC의 Wi-Fi IPv4 주소와 8000 포트입니다.
휴대폰과 PC를 같은 Wi-Fi에 연결한 뒤 프론트 저장소에서:

```powershell
npm install
npx expo start --clear
```

BAZE 키는 백엔드에만 보관합니다. EXPO_PUBLIC_*에 비밀키를 넣지 않습니다.

## 연결 흐름

1. 'QR 사진으로 상표명도 찾기'를 켜서 QR과 상표가 함께 보이는 사진을 선택하거나 촬영합니다.
2. 기기에서 QR URL을 읽고 사진을 축소·JPEG base64로 변환합니다.
3. POST /api/ocr/brands로 JSON의 image_base64를 전송합니다. 원본 이미지 제한은 3MiB입니다.
4. 백엔드 app/brand_ocr.py의 read_brands가 BAZE 이미지 모델을 한 번 호출합니다.
5. 응답의 status, brands[].name, brands[].registered를 읽고 후보를 표시합니다.
6. 사용자가 상표 후보를 확인하거나 건너뛴 뒤 POST /api/analyze에 brand_texts를 전달합니다.

'추가 정보'에서도 상표명을 직접 입력하거나 별도 사진을 읽어 후보를 선택할 수 있습니다.
사진은 백엔드를 거쳐 외부 AI 게이트웨이에 전송되며 AI 사용량이 발생할 수 있습니다.
백엔드는 사진을 영구 저장·로그·캐시하지 않습니다. 외부 서비스의 보관 정책은 별개입니다.
등록 여부는 공식 도메인 DB에 비교 정보가 있다는 뜻이며 사이트가 안전하다는 뜻은 아닙니다.
AI OCR은 수치 신뢰도를 제공하지 않으므로 임의의 퍼센트를 표시하지 않습니다.
영문 등 명시적으로 등록된 별칭은 정규 상표 후보로 함께 제시합니다.
인식 실패나 알 수 없는 상표는 안전 판정이 아니며 직접 입력 또는 건너뛰기를 안내합니다.
AI API는 인쇄된 웹 주소도 반환하지만 현재 앱의 이 흐름에서는 상표 후보만 사용합니다.

## API 구분

| API | 입력 | 실행 |
| --- | --- | --- |
| /api/ocr/brands | JSON image_base64, 3MiB 이하 | BAZE AI OCR, 현재 앱에서 사용 |
| /api/ocr/brands/local | multipart image, 5MiB 이하 JPEG/PNG | EasyOCR CPU, 별도 선택용 |

AI 실패 시 CPU로 자동 재시도하지 않습니다.

## 확인

```powershell
npm run typecheck
npm run lint
npm test
npm run check:ocr -- "C:/photos/starbucks.jpg" "스타벅스"
```

check:ocr는 지정한 사진을 실제 AI OCR에 보내므로 **AI 호출 1회분의 사용량이 발생할 수 있습니다**.
이어 차단 대상 https://127.0.0.1로 분석을 요청해 선택한 상표의 전달을 검증합니다.
뒤의 차단 주소 분석에서는 대상 사이트 접속이나 페이지 AI 분석이 실행되지 않습니다.

휴대폰에서는 후보 확인 전 분석이 시작되지 않는지, 여러 후보·빈 결과·오류·취소를 처리할 수 있는지,
선택한 상표가 결과에 반영되는지, QR 사이트가 자동으로 열리지 않는지 추가 확인하세요.
