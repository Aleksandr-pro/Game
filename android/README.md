# Brawl Arena для Android

APK — это WebView-оболочка вокруг офлайн-сборки игры (`release/BrawlArena.html`).
Интернет нужен только для проверки и скачивания обновлений; сама игра работает офлайн.

## Сборка

Собирается автоматически в GitHub Actions
([`.github/workflows/android.yml`](../.github/workflows/android.yml)) на каждый пуш в `main`
и вручную через **Actions → Android APK → Run workflow**.

Локально нужны JDK 17 и Android SDK:

```bash
npm ci
npm run build            # release/BrawlArena.html
cd android
gradle assembleRelease -PversionCode=1 -PversionName=1.0.0
# → android/app/build/outputs/apk/release/BrawlArena.apk
```

Gradle-задача `prepareGameAssets` сама копирует свежий `release/BrawlArena.html`
в `app/src/main/assets/index.html` и пишет туда `version.json`.

## Версии

- `versionCode` — число коммитов в `main` (`git rev-list --count HEAD`), поэтому всегда растёт.
- `versionName` — версия из `package.json` (или ввод при ручном запуске workflow).

## Подпись

`android/keystore.properties` и `android/keystore/brawl-arena.p12` лежат в репозитории
намеренно: Android устанавливает обновление поверх старой версии только при совпадении подписи.
Ключ тестовый, для других приложений его использовать нельзя.

## Как приходит обновление

1. Пуш в `main` → GitHub Actions собирает APK.
2. APK и `update.json` (номер сборки, версия, sha256) публикуются в релиз с тегом
   [`android-latest`](https://github.com/Aleksandr-pro/Game/releases/tag/android-latest).
3. Приложение при запуске (и по кнопке «Проверить обновления») читает
   `releases/tags/android-latest`, сравнивает `versionCode` и предлагает обновление.
4. Пользователь подтверждает — APK скачивается и открывается системный установщик.
   Данные игры (прогресс, настройки) сохраняются, потому что `applicationId` не меняется.

Постоянная ссылка на последнюю версию:

```
https://github.com/Aleksandr-pro/Game/releases/download/android-latest/BrawlArena.apk
```
