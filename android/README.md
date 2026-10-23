# Sana для Android

APK — нативная WebView-оболочка вокруг автономной сборки `release/Sana.html`. Все задания и интерфейс находятся внутри APK, поэтому обучение работает без интернета. Ответы и настройки сохраняются в локальном хранилище WebView.

## Локальная сборка

Нужны JDK 17 и Android SDK 34:

```bash
npm ci
npm run icons
npm run android:icons
npm run build
cd android
gradle assembleRelease -PversionCode=1 -PversionName=1.0.0
```

Результат: `android/app/build/outputs/apk/release/Sana.apk`.

Gradle-задача `prepareSanaAssets` копирует свежий `release/Sana.html` в `app/src/main/assets/index.html` и записывает рядом `version.json`.

## Версии

- `versionCode` передаётся параметром `-PversionCode`; в CI используется число коммитов.
- `versionName` берётся из `package.json` или из поля ручного запуска workflow.
- `applicationId`: `com.sana.math`.

## Подпись

Настройки подписи находятся в `android/keystore.properties`. Для обновления APK поверх установленной версии необходимо сохранять ту же подпись и увеличивать `versionCode`.

## GitHub Actions

Workflow [`.github/workflows/android.yml`](../.github/workflows/android.yml):

1. устанавливает Node.js, JDK 17 и Android SDK;
2. запускает автоматические проверки;
3. создаёт иконки и автономный HTML;
4. собирает и проверяет подпись APK;
5. прикладывает `Sana.apk` к артефактам и публикует релиз `sana-android-latest` при пуше в `main`.

Постоянная ссылка на последнюю сборку после публикации:

```text
https://github.com/Aleksandr-pro/Game/releases/download/sana-android-latest/Sana.apk
```
