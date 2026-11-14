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


## 사진 QR 인식 실패 처리 (2026-11-14)

"사진에서 QR을 찾지 못했어요"는 휴대폰의 사진 QR 디코딩 단계 오류입니다.
이 단계에서 실패하면 /api/ocr/brands와 /api/analyze는 아직 호출되지 않습니다.
포스터 안에 QR이 보여도, 사진에서 차지하는 비중·초점·반사·압축에 따라 인식되지 않을 수 있습니다.

카메라 촬영과 앨범 선택은 모두 readQRFromPhoto를 사용합니다.
원본을 먼저 검사하고, 실패하면 로컬 PNG 변환본과 중앙/겹치는 영역을 최대 13회 검사합니다.
원본에서 성공하면 변환하지 않습니다. 인식 결과는 텍스트로만 사용하며 QR 주소를 열지 않습니다.
포스터 촬영의 강제 자르기를 없앴습니다. QR 인식용 영역과 AI OCR 입력을 분리해서
상표·인쇄 주소는 원래 포스터 사진에서 읽습니다. 자동 영역 재검사 자체는 서버·AI를 호출하지 않습니다.

검증: 프론트 테스트 39개, 타입 검사, lint 통과.
새 사진 인식 테스트는 native 모듈 대역으로 재시도·영역 경계·성공 시 중단·실패 구분을 검증합니다.
Android/iOS 실제 카메라의 인식률은 실기기에서 별도로 확인해야 합니다.

재확인: Expo 앱을 Reload한 뒤 같은 사진을 선택하고,
상표·안내문까지 나오되 QR이 너무 작지 않게 촬영합니다.
그래도 실패하면 사진 인식을 끄고 실시간 QR 스캔을 비교해 주세요.
공식 SDK 안내: https://docs.expo.dev/versions/v58.0.0/sdk/camera/#camerascanfromurlasyncurl-barcodetypes


## 휴대폰 인식 실패 시 서버 QR 디코딩

위 로컬 재시도 이후에도 실패하면 사진 인식을 켠 경우 POST /api/qr/decode로 사진을 보내
독립된 ZXing 디코더로 QR 문자열을 읽습니다. AI 호출이나 대상 사이트 방문은 없습니다.
사진 인식을 끈 경우 서버에 사진을 전송하지 않습니다.
QR 디코딩에는 긴 변 최대 3200px 사진을 사용하고, 이후 상표·주소 OCR은 기존 1600px 입력을 사용합니다.
서버 연결/시간 초과/구버전 API 오류는 QR 미검출과 구분해 화면에 표시합니다.
새 버전에서는 서버 검사 중 "휴대폰에서 읽지 못해 서버에서 QR 사진을 검사하고 있어요."가 표시됩니다.
새 의존성 zxing-cpp는 BE requirements.txt에 포함됐습니다.
실행 중인 백엔드와 프론트 API 함수 연결에서 네 테스트 포스터의 QR 원문이 정확히 반환됐습니다.
이 검사는 실제 사용자 사진이나 휴대폰 카메라 조작까지 재현한 검사가 아닙니다.

## 후속 변경: 사진 옵션의 서버 우선 인식과 페이지 AI 제외

사진 옵션을 켜면 이제 서버 QR 디코딩부터 수행하고, 서버에서 읽지 못한 경우 로컬 인식으로 보완합니다.
서버 연결 오류는 로컬에서도 읽지 못했을 때 QR 미검출 오류로 덮지 않습니다.
화면에는 "서버에서 사진 속 QR을 읽고 있어요. 주소는 열지 않아요."가 표시됩니다.
현재 metadata-v2/combined-v2 결과에서 페이지 AI는 참고 항목으로만 표시하며, 미확인이어도 종합 등급을 강등하지 않습니다.
공식 도메인 AI 검색 및 TLS/RDAP 등의 미확인은 기존처럼 반영합니다.
