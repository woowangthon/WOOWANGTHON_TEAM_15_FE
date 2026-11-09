# QR 입력 기능

## 실행

이 FE 폴더에서 `npm start`를 실행하고 SDK 58을 지원하는 Android/iOS Expo Go로 연결합니다. 기존 의존성과 설정은 유지했습니다.

## 동작 및 확인

- CameraView + barcodeTypes: ['qr']로 카메라 QR만 인식합니다. 처음 인식한 결과 이후 카메라를 닫습니다.
- 이미지 선택 결과 assets[0].uri(로컬 file:// 또는 content:// 문자열)를 scanFromURLAsync(uri, ['qr'])에 전달합니다. base64나 QR 내용의 URL을 전달하지 않습니다.
- 이미지에 여러 QR이 있으면 API 배열의 첫 결과를 사용합니다. 공간상 왼쪽/위쪽 순서를 보장하지 않습니다.
- 원본은 그대로 보존하고, 전체 문자열이 유효한 HTTP/HTTPS URL이면 URL 파서로 정규화한 값을 별도로 표시합니다. URL 부분 문자열 추출이나 다른 스킴은 지원하지 않습니다.
- 사진 업로드, QR URL 요청, 링크 생성, 자동 열기는 없습니다.
- 실기기에서 권한 허용/거부/영구 거부, 선택 취소, QR 없는 사진, 여러 QR 사진, 일반 문자열, HTTP(S) URL, 재스캔을 확인해야 합니다. Android는 QR이 사진의 큰 부분을 차지할수록 잘 읽힙니다.

## OCR 검토

현재 설치된 모듈과 Expo Go 내장 API에는 선택 이미지용 OCR이 없습니다. OCR은 구현하지 않았으며 미지원 안내만 표시합니다. 브라우저용 Tesseract.js는 DOM/Worker/WASM 실행 환경을 전제로 하므로 현재 React Native 화면에 그대로 사용할 수 있는 대안이 아닙니다.

개발 빌드를 허용한다면 `expo-text-extractor`가 후보입니다. 로컬 이미지 URI를 받아 Android Google ML Kit / iOS Apple Vision으로 텍스트를 읽습니다. `expo-dev-client`와 해당 네이티브 모듈을 포함하는 새 개발 빌드가 필요하며 Expo Go에서는 사용할 수 없습니다. 패키지 설치나 네이티브 설정 변경은 하지 않았습니다. SDK 58 및 새 아키텍처 호환성, 한국어 모델 지원/번들 방식, 네트워크 없이 동작하는지 실기기 검증이 필요합니다. 텍스트 추출만으로 상표명을 확정할 수 없으므로 이후 상표 후보 선택/확인 과정도 필요합니다.

## 참고

- https://docs.expo.dev/versions/v58.0.0/sdk/camera/
- https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/
- https://docs.expo.dev/develop/development-builds/introduction/
- https://github.com/pchalupa/expo-text-extractor
