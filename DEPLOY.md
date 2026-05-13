# Запуск gogachess в интернете — пошагово

Документ ведёт от пустого VPS до рабочего сайта на вашем домене с HTTPS,
PostgreSQL и WebSocket-аудио. Если коротко: **VPS + Nginx + PostgreSQL + Docker** (или PM2).

---

## 0. Что вам понадобится купить / завести

| Что              | Где (примеры)                                  | Зачем                      |
|------------------|-----------------------------------------------|----------------------------|
| Домен            | reg.ru, timeweb, namecheap, cloudflare        | Адрес сайта                |
| VPS (Linux)      | Timeweb, Selectel, DigitalOcean, Hetzner      | Сервер для приложения      |
| (опц.) База      | Neon, Supabase, Railway                       | Postgres «как сервис»      |
| (опц.) TURN VPS  | тот же VPS / отдельный                        | Стабильное аудио           |

**Минимум, чтобы открыться:** домен (≈100–700 ₽/год) + VPS 1 vCPU / 1 ГБ RAM (≈200–600 ₽/мес).

---

## 1. Купите домен

1. Откройте регистратора → найдите свободное имя → оплатите.
2. В панели регистратора зайдите в **Управление DNS**.
3. Создайте A-запись: `@` → IP вашего VPS (см. шаг 2).
   Дополнительно `www` → тот же IP (или CNAME `www` → `@`).
4. Подождите 10–60 минут, пока DNS обновится.

---

## 2. Купите и подготовьте VPS

1. Создайте VPS с **Ubuntu 22.04/24.04**.
2. Запишите **публичный IP** и пароль/ключ root.
3. Подключитесь по SSH:
   ```bash
   ssh root@IP_ВАШЕГО_VPS
   ```
4. Обновите систему и поставьте базовое:
   ```bash
   apt update && apt upgrade -y
   apt install -y git curl ufw nginx
   ufw allow OpenSSH
   ufw allow 'Nginx Full'
   ufw --force enable
   ```

---

## 3. Скопируйте проект на сервер

Положите код в `/opt/gogachess` (любой каталог, главное — путь не меняйте дальше).

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/ВАШ_РЕПО/gogachess.git gogachess
cd /opt/gogachess
cp .env.example .env
nano .env   # заполните JWT_SECRET, DATABASE_URL, SITE_URL
```

`JWT_SECRET` сгенерируйте, например, так:
```bash
openssl rand -hex 32
```

---

## 4. Выберите способ запуска

### Вариант A — Docker (быстрее)

1. Поставьте Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. В `.env` (рядом с `docker-compose.yml`) задайте минимум:
   ```env
   JWT_SECRET=...      # 32+ символа
   POSTGRES_USER=gogachess
   POSTGRES_PASSWORD=придумайте_пароль
   POSTGRES_DB=gogachess
   SITE_URL=https://gogachess.ru
   ```
3. Запуск:
   ```bash
   docker compose up -d --build
   docker compose logs -f app   # смотреть, что приложение поднялось
   ```
4. Проверка: `curl -I http://127.0.0.1:3001` должно вернуть `HTTP/1.1 200 OK`
   (Compose публикует приложение на **3001** хоста, чтобы не столкнуться с процессом на `:3000`).

### Вариант B — PM2 (без Docker)

1. Поставьте Node.js 20 и PM2:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs
   npm i -g pm2
   ```
2. Пропишите `DATABASE_URL` и остальное в `.env` (как в `.env.example`).
3. Сборка и старт:
   ```bash
   cd /opt/gogachess
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   npm run build
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup systemd -u root --hp /root   # автозапуск при перезагрузке
   ```

---

## 5. Подключите Nginx + ваш домен

1. Скопируйте пример:
   ```bash
   cp /opt/gogachess/deploy/nginx.conf.example /etc/nginx/sites-available/gogachess.conf
   sed -i 's/gogachess.ru/ВАШ_ДОМЕН/g' /etc/nginx/sites-available/gogachess.conf
   ln -s /etc/nginx/sites-available/gogachess.conf /etc/nginx/sites-enabled/
   ```
2. В `/etc/nginx/nginx.conf` (внутри `http { ... }`) убедитесь, что есть `map`:
   ```nginx
   map $http_upgrade $connection_upgrade {
       default upgrade;
       ''      close;
   }
   ```
3. Проверка и перезапуск:
   ```bash
   nginx -t && systemctl reload nginx
   ```
4. Откройте `http://ВАШ_ДОМЕН` — должен открыться сайт по HTTP.

---

## 6. Включите HTTPS (Let’s Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d ВАШ_ДОМЕН -d www.ВАШ_ДОМЕН
```

Certbot сам поправит конфиг и добавит редирект `http -> https`.
Сертификат автообновляется (`systemctl status certbot.timer`).

После HTTPS обязательно проверьте:
- `https://ВАШ_ДОМЕН` открывается;
- В кабинете Chrome замок зелёный;
- В комнате запрашивается **микрофон** — без HTTPS он не работает.

---

## 7. TURN-сервер для аудио через мобильный интернет

**Зачем:** при подключении с мобильного интернета (4G/5G, Carrier-Grade NAT) или
из корпоративных сетей чистый STUN не пробивает — нужен TURN-relay.

В `docker-compose.yml` уже описан сервис `turn` на основе образа `coturn/coturn`.
Он использует **тот же** TLS-сертификат от Let's Encrypt, что и nginx
(для **TURNS** через TLS на 5349), и общий секрет (`TURN_SECRET`) с сервером
приложения для генерации **краткоживущих** credentials (RFC 7635) — никаких
постоянных паролей в JS-бандле.

### 7.1. На VPS — открыть порты в firewall

```bash
ufw allow 3478/udp        # STUN/TURN основной
ufw allow 3478/tcp        # TURN over TCP (для сетей, где UDP режут)
ufw allow 5349/tcp        # TURNS (TURN over TLS)
ufw allow 49152:65535/udp # пул relay-портов
```

### 7.2. Заполнить переменные в `/opt/gogachess/.env`

```bash
cd /opt/gogachess
# Сгенерировать секрет (длинная случайная строка)
echo "TURN_SECRET=$(openssl rand -hex 32)" >> .env
echo "TURN_REALM=ВАШ_ДОМЕН" >> .env
echo "TURN_HOST=ВАШ_ДОМЕН"  >> .env
# Узнать публичный IP VPS:
echo "TURN_EXTERNAL_IP=$(curl -s ifconfig.me)" >> .env
# Проверьте, что значения подставились корректно:
tail -10 .env
```

### 7.3. Запуск coturn

```bash
docker compose up -d turn
docker logs --tail 30 gogachess-turn-1
```

В логах должно быть `Listener address ... 3478` и **никаких** `cannot read` про сертификаты.

### 7.4. Проверка

С локального ПК (Windows: PowerShell, Linux/Mac: терминал):

```bash
# Проверка STUN-листенера (без авторизации)
nc -zv ВАШ_ДОМЕН 3478
# Проверка TURNS-листенера (TLS)
openssl s_client -connect ВАШ_ДОМЕН:5349 -servername ВАШ_ДОМЕН < /dev/null
```

Затем тест в браузере: откройте сайт, F12 → Console, нажмите «Подключиться».
Должны увидеть строки `[audio] received ICE servers: [..., 'turn:...', 'turns:...']`
и среди ICE-кандидатов появится `relay udp/tcp` — это означает, что TURN отвечает.

### 7.5. Обновление сертификата

Certbot обновляет сертификат каждые ~60 дней. После обновления нужно
перезапустить coturn, чтобы он подхватил новый файл:

```bash
docker compose restart turn
```

Можно автоматизировать через certbot deploy-hook — см. документацию certbot.

---

## 8. Обновление кода

Дальнейший workflow:

1. У себя в Cursor правите код, коммитите и пушите в репозиторий.
2. На сервере:
   ```bash
   cd /opt/gogachess
   bash scripts/deploy.sh        # для PM2-варианта
   # или
   docker compose up -d --build  # для Docker-варианта
   ```
3. Сайт по тому же домену **сразу** показывает новую версию.
   Домен трогать не нужно.

---

## 9. Полезные команды

```bash
pm2 logs gogachess           # логи приложения (PM2)
docker compose logs -f app   # логи (Docker)
journalctl -u nginx -e       # логи Nginx
systemctl status nginx       # статус Nginx
certbot renew --dry-run      # тест автопродления сертификата
```

---

## 10. Чек-лист «открытия сайта»

- [ ] Домен куплен, DNS A-запись указывает на IP VPS.
- [ ] VPS обновлён, открыты порты 80/443/22.
- [ ] `.env` содержит сильный `JWT_SECRET` и реальный `DATABASE_URL`.
- [ ] Приложение поднято: Docker — `curl 127.0.0.1:3001`, PM2 — `curl 127.0.0.1:3000`.
- [ ] Nginx проксирует `/` и `/socket.io/` (с upgrade).
- [ ] HTTPS-сертификат выдан.
- [ ] (опц.) TURN-сервер настроен, аудио работает у разных провайдеров.
- [ ] Регулярные **бэкапы Postgres** (см. возможности вашего хостинга или
      `pg_dump` по cron).
