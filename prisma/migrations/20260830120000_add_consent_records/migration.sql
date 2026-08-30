-- Фиксация согласий пользователя.
--
-- Зачем: по ст. 9 152-ФЗ доказывать наличие согласия на обработку персональных
-- данных обязан оператор. До этой миграции галочка под формой регистрации
-- проверялась только в браузере и нигде не сохранялась, то есть подтвердить
-- согласие было нечем.
--
-- Все колонки добавляются как NULL-able и ничего не удаляют: у существующих
-- пользователей они останутся пустыми, работа сайта не меняется.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentDocumentVersion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentIp" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentUserAgent" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cookieConsent" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cookieConsentAt" TIMESTAMP(3);
