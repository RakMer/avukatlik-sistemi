# Avukatlık Sistemi — Mikro Servis & n8n Entegrasyonu

Bu proje, avukatların Telegram üzerinden gönderdiği hukuki belgeleri (tebligat zarfı, duruşma davetiyesi vb.) Gemini 2.5 Flash ile parse edip kaydeden ve duruşma tarihlerini takip edip avukata bildirimler gönderen mikro servis mimarili bir sistemdir.

## 🛠️ Sistem Mimarisi

- **n8n**: Telegram Trigger ve Gemini entegrasyonu ile veri alım, onay ve bildirim akışlarını görsel olarak yönetir.
- **case-service**: Müvekkil, dava ve duruşma bilgilerini kaydeden, onay mekanizmasını yöneten Express/Prisma API'si.
- **notification-service**: Her gün yaklaşan duruşmaları kontrol edip n8n üzerinden Telegram'a hatırlatma gönderen cron servisi.
- **db-backup**: Google Cloud Storage (GCS) veya S3 uyumlu depolama alanına otomatik veritabanı yedeği yükleyen Alpine tabanlı cron servisi.

---

## 🚀 Hızlı Başlangıç (Lokal Geliştirme)

### 1. Hazırlık
`.env.example` dosyasını kopyalayarak bir `.env` dosyası oluşturun ve gerekli alanları doldurun:
```bash
cp .env.example .env
```

`.env` dosyasındaki şu değişkenleri düzenleyin:
- `TELEGRAM_BOT_TOKEN`: [@BotFather](https://t.me/BotFather) adresinden aldığınız bot token.
- `GCS_BUCKET`: Yedeklerin yükleneceği Google Cloud Storage bucket adı.
- `N8N_HOST` / `WEBHOOK_URL`: n8n'in erişilebilir olacağı adres (örneğin lokal geliştirme için bir ngrok adresi).

### 2. Google Cloud GCS Yetkilendirmesi (Yedekleme İçin)
Google Cloud Console'dan bir Service Account oluşturun ve anahtar dosyasını indirip projede şu dizine kaydedin:
`./secrets/gcs-key.json`

### 3. Servisleri Başlatma
Docker Compose kullanarak tüm servisleri, PostgreSQL ve Redis veritabanlarını tek komutla başlatın:
```bash
docker-compose up --build -d
```

### 4. Prisma Veritabanı Migrasyonlarını Çalıştırma
case-service container'ı içinde prisma tablolarını oluşturun:
```bash
docker-compose exec case-service npx prisma migrate deploy
```

---

## ⚙️ n8n Workflow'larını İçe Aktarma (Import)

n8n arayüzüne (`http://localhost:5678`) gidin ve workflow alanından sağ üst köşedeki menüden **Import from File** seçeneğini kullanarak şu dosyaları içe aktarın:

1. **Belge Giriş Akışı**: `n8n/workflows/telegram-ai-intake.json`
2. **Duruşma Hatırlatıcı Akışı**: `n8n/workflows/hearing-reminder.json`

İçe aktardıktan sonra:
- Telegram node'ları için kendi Telegram Credential tanımlamanızı seçin.
- Gemini node'u için Google Gemini API key tanımlamanızı yapın.
- Her iki workflow'u da **Active** konumuna getirin.

---

## ⏰ Duruşma Hatırlatma Testi

Cron job varsayılan olarak her sabah **09:00**'da çalışır. Test etmek için manuel olarak şu API isteğini atarak hatırlatıcıyı tetikleyebilirsiniz:

```bash
curl -X POST http://localhost:3002/api/v1/notifications/trigger
```

---

## 📂 Dosya Yapısı

```
avukatlik-sistemi/
├── docker-compose.yml
├── .env.example
├── README.md
├── secrets/
│   └── gcs-key.json        # Google Cloud yedekleme anahtarı
├── scripts/
│   ├── db-backup.sh        # Yedekleme scripti
│   ├── entrypoint-backup.sh
│   └── Dockerfile.backup   # Yedekleme dockerfile'ı
├── services/
│   ├── case-service/       # Ana backend servisi
│   └── notification-service/ # Cron / Hatırlatma servisi
└── n8n/
    └── workflows/          # n8n workflows şablonları
```
